from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db


router = APIRouter(prefix="/cashier/topup", tags=["topup"])

BANK_ACCOUNT = 9999999


class SbpTopupRequest(BaseModel):
    cashier_account: int = Field(..., description="Аккаунт кассира")
    store_id: int = Field(..., description="ТВТ")
    user_account: int = Field(..., description="Пайщик")
    amount: Decimal = Field(..., description="Сумма пополнения")
    session_id: str | None = Field(default=None, description="ID сессии")
    device_id: str | None = Field(default="web", description="ID устройства")


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@router.post("/sbp")
async def sbp_topup_stub(
    payload: SbpTopupRequest,
    db: AsyncSession = Depends(get_db),
):
    device_id = payload.device_id or "web"
    amount = money(payload.amount)

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма пополнения должна быть больше нуля")

    # 1. Проверяем доступ кассира к ТВТ
    access_result = await db.execute(
        text("""
            SELECT
                cs.cashier_account,
                cs.store_id
            FROM coop.pos_cashier_stores cs
            JOIN coop.pos_stores s
                ON s.store_id = cs.store_id
            WHERE cs.cashier_account = :cashier_account
              AND cs.store_id = :store_id
              AND cs.is_active = TRUE
              AND s.is_active = TRUE
            LIMIT 1
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
        },
    )

    if not access_result.mappings().first():
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    # 2. Блокируем счет пайщика и технический счет банка
    users_result = await db.execute(
        text("""
            SELECT
                user_account,
                balance
            FROM coop.pos_users
            WHERE user_account IN (:user_account, :bank_account)
              AND is_active = TRUE
            FOR UPDATE
        """),
        {
            "user_account": payload.user_account,
            "bank_account": BANK_ACCOUNT,
        },
    )

    rows = {row["user_account"]: row for row in users_result.mappings().all()}

    if payload.user_account not in rows:
        raise HTTPException(status_code=404, detail="Пайщик не найден")

    if BANK_ACCOUNT not in rows:
        raise HTTPException(status_code=500, detail="Технический счет банка 9999999 не найден")

    user_balance_before = money(rows[payload.user_account]["balance"])
    bank_balance_before = money(rows[BANK_ACCOUNT]["balance"])

    if bank_balance_before < amount:
        raise HTTPException(status_code=400, detail="На техническом счете банка недостаточно паев")

    user_balance_after = money(user_balance_before + amount)
    bank_balance_after = money(bank_balance_before - amount)

    # 3. Создаем шапку операции
    tx_result = await db.execute(
        text("""
            INSERT INTO coop.pos_account_transactions (
                transaction_type,
                status,
                cashier_account,
                store_id,
                amount,
                comment,
                metadata
            )
            VALUES (
                'sbp_topup',
                'done',
                :cashier_account,
                :store_id,
                CAST(:amount AS numeric),
                'СБП пополнение через заглушку кассы',
                jsonb_build_object(
                    'user_account', CAST(:user_account AS bigint),
                    'bank_account', CAST(:bank_account AS bigint),
                    'session_id', CAST(:session_id AS text),
                    'device_id', CAST(:device_id AS text),
                    'stub', TRUE
                )
            )
            RETURNING transaction_id
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
            "amount": amount,
            "user_account": payload.user_account,
            "bank_account": BANK_ACCOUNT,
            "session_id": payload.session_id,
            "device_id": device_id,
        },
    )

    transaction_id: UUID = tx_result.scalar_one()

    # 4. Обновляем балансы
    await db.execute(
        text("""
            UPDATE coop.pos_users
            SET
                balance = CAST(:balance_after AS numeric),
                updated_at = now()
            WHERE user_account = :account
        """),
        {
            "balance_after": bank_balance_after,
            "account": BANK_ACCOUNT,
        },
    )

    await db.execute(
        text("""
            UPDATE coop.pos_users
            SET
                balance = CAST(:balance_after AS numeric),
                updated_at = now()
            WHERE user_account = :account
        """),
        {
            "balance_after": user_balance_after,
            "account": payload.user_account,
        },
    )

    # 5. Строки движения
    await db.execute(
        text("""
            INSERT INTO coop.pos_account_transaction_lines (
                transaction_id,
                account,
                amount_delta,
                line_type,
                balance_before,
                balance_after
            )
            VALUES (
                CAST(:transaction_id AS uuid),
                :account,
                CAST(:amount_delta AS numeric),
                'bank_debit',
                CAST(:balance_before AS numeric),
                CAST(:balance_after AS numeric)
            )
        """),
        {
            "transaction_id": str(transaction_id),
            "account": BANK_ACCOUNT,
            "amount_delta": -amount,
            "balance_before": bank_balance_before,
            "balance_after": bank_balance_after,
        },
    )

    await db.execute(
        text("""
            INSERT INTO coop.pos_account_transaction_lines (
                transaction_id,
                account,
                amount_delta,
                line_type,
                balance_before,
                balance_after
            )
            VALUES (
                CAST(:transaction_id AS uuid),
                :account,
                CAST(:amount_delta AS numeric),
                'shareholder_credit',
                CAST(:balance_before AS numeric),
                CAST(:balance_after AS numeric)
            )
        """),
        {
            "transaction_id": str(transaction_id),
            "account": payload.user_account,
            "amount_delta": amount,
            "balance_before": user_balance_before,
            "balance_after": user_balance_after,
        },
    )

    # 6. Аудит
    await db.execute(
        text("""
            INSERT INTO coop.pos_cashier_actions (
                cashier_account,
                store_id,
                action_type,
                target_type,
                target_id,
                success,
                after_data,
                device_id
            )
            VALUES (
                :cashier_account,
                :store_id,
                'sbp_topup_stub',
                'user',
                :target_id,
                TRUE,
                jsonb_build_object(
                    'transaction_id', CAST(:transaction_id AS text),
                    'user_account', CAST(:user_account AS bigint),
                    'amount', CAST(:amount AS numeric),
                    'session_id', CAST(:session_id AS text)
                ),
                :device_id
            )
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
            "target_id": str(payload.user_account),
            "transaction_id": str(transaction_id),
            "user_account": payload.user_account,
            "amount": amount,
            "session_id": payload.session_id,
            "device_id": device_id,
        },
    )

    await db.commit()

    return {
        "ok": True,
        "transaction_id": str(transaction_id),
        "user_account": payload.user_account,
        "amount": float(amount),
        "user_balance_before": float(user_balance_before),
        "user_balance_after": float(user_balance_after),
        "bank_balance_after": float(bank_balance_after),
    }


class CashTopupRequest(BaseModel):
    cashier_account: int = Field(..., description="Аккаунт кассира")
    store_id: int = Field(..., description="ТВТ")
    user_account: int = Field(..., description="Пайщик")
    amount: Decimal = Field(..., description="Сумма пополнения наличными")
    session_id: str | None = Field(default=None, description="ID сессии")
    device_id: str | None = Field(default="web", description="ID устройства")


@router.post("/cash")
async def cash_topup(
    payload: CashTopupRequest,
    db: AsyncSession = Depends(get_db),
):
    device_id = payload.device_id or "web"
    amount = money(payload.amount)

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма пополнения должна быть больше нуля")

    # 1. Проверяем доступ кассира к ТВТ и получаем владельца ТВТ
    access_result = await db.execute(
        text("""
            SELECT
                cs.cashier_account,
                cs.store_id,
                so.owner_account
            FROM coop.pos_cashier_stores cs
            JOIN coop.pos_store_owners so
                ON so.store_id = cs.store_id
               AND so.is_active = TRUE
            JOIN coop.pos_stores s
                ON s.store_id = cs.store_id
            WHERE cs.cashier_account = :cashier_account
              AND cs.store_id = :store_id
              AND cs.is_active = TRUE
              AND s.is_active = TRUE
            LIMIT 1
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
        },
    )

    access = access_result.mappings().first()

    if not access:
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    owner_account = access["owner_account"]

    # 2. Блокируем лимит кассира по владельцу ТВТ
    limit_result = await db.execute(
        text("""
            SELECT
                cashier_account,
                store_owner_account,
                cash_balance,
                cash_limit
            FROM coop.pos_cashier_limit
            WHERE cashier_account = :cashier_account
              AND store_owner_account = :owner_account
              AND is_active = TRUE
            FOR UPDATE
        """),
        {
            "cashier_account": payload.cashier_account,
            "owner_account": owner_account,
        },
    )

    cashier_limit = limit_result.mappings().first()

    if not cashier_limit:
        raise HTTPException(status_code=400, detail="Для кассира не настроен лимит наличных по владельцу ТВТ")

    cash_balance_before = money(cashier_limit["cash_balance"])
    cash_limit = money(cashier_limit["cash_limit"])
    cash_balance_after = money(cash_balance_before + amount)

    if cash_balance_after > cash_limit:
        raise HTTPException(
            status_code=400,
            detail=f"Превышен лимит наличных кассира. Лимит {cash_limit}, сейчас {cash_balance_before}, пополнение {amount}",
        )

    # 3. Блокируем счета владельца и пайщика
    users_result = await db.execute(
        text("""
            SELECT
                user_account,
                balance
            FROM coop.pos_users
            WHERE user_account IN (:owner_account, :user_account)
              AND is_active = TRUE
            FOR UPDATE
        """),
        {
            "owner_account": owner_account,
            "user_account": payload.user_account,
        },
    )

    users = {row["user_account"]: row for row in users_result.mappings().all()}

    if owner_account not in users:
        raise HTTPException(status_code=404, detail="Владелец ТВТ не найден")

    if payload.user_account not in users:
        raise HTTPException(status_code=404, detail="Пайщик не найден")

    owner_balance_before = money(users[owner_account]["balance"])
    user_balance_before = money(users[payload.user_account]["balance"])

    if owner_balance_before < amount:
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно паев на счете владельца ТВТ. Нужно {amount}, доступно {owner_balance_before}",
        )

    owner_balance_after = money(owner_balance_before - amount)
    user_balance_after = money(user_balance_before + amount)

    # 4. Создаем шапку операции
    tx_result = await db.execute(
        text("""
            INSERT INTO coop.pos_account_transactions (
                transaction_type,
                status,
                cashier_account,
                store_id,
                owner_account,
                amount,
                comment,
                metadata
            )
            VALUES (
                'cash_topup',
                'done',
                :cashier_account,
                :store_id,
                :owner_account,
                CAST(:amount AS numeric),
                'Пополнение П/С пайщика наличными через кассу',
                jsonb_build_object(
                    'user_account', CAST(:user_account AS bigint),
                    'session_id', CAST(:session_id AS text),
                    'device_id', CAST(:device_id AS text)
                )
            )
            RETURNING transaction_id
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
            "owner_account": owner_account,
            "amount": amount,
            "user_account": payload.user_account,
            "session_id": payload.session_id,
            "device_id": device_id,
        },
    )

    transaction_id: UUID = tx_result.scalar_one()

    # 5. Обновляем балансы владельца и пайщика
    await db.execute(
        text("""
            UPDATE coop.pos_users
            SET
                balance = CAST(:balance_after AS numeric),
                updated_at = now()
            WHERE user_account = :account
        """),
        {
            "balance_after": owner_balance_after,
            "account": owner_account,
        },
    )

    await db.execute(
        text("""
            UPDATE coop.pos_users
            SET
                balance = CAST(:balance_after AS numeric),
                updated_at = now()
            WHERE user_account = :account
        """),
        {
            "balance_after": user_balance_after,
            "account": payload.user_account,
        },
    )

    # 6. Строки движения паев
    await db.execute(
        text("""
            INSERT INTO coop.pos_account_transaction_lines (
                transaction_id,
                account,
                amount_delta,
                line_type,
                balance_before,
                balance_after
            )
            VALUES (
                CAST(:transaction_id AS uuid),
                :account,
                CAST(:amount_delta AS numeric),
                'owner_debit',
                CAST(:balance_before AS numeric),
                CAST(:balance_after AS numeric)
            )
        """),
        {
            "transaction_id": str(transaction_id),
            "account": owner_account,
            "amount_delta": -amount,
            "balance_before": owner_balance_before,
            "balance_after": owner_balance_after,
        },
    )

    await db.execute(
        text("""
            INSERT INTO coop.pos_account_transaction_lines (
                transaction_id,
                account,
                amount_delta,
                line_type,
                balance_before,
                balance_after
            )
            VALUES (
                CAST(:transaction_id AS uuid),
                :account,
                CAST(:amount_delta AS numeric),
                'shareholder_credit',
                CAST(:balance_before AS numeric),
                CAST(:balance_after AS numeric)
            )
        """),
        {
            "transaction_id": str(transaction_id),
            "account": payload.user_account,
            "amount_delta": amount,
            "balance_before": user_balance_before,
            "balance_after": user_balance_after,
        },
    )

    # 7. Обновляем наличные кассира
    await db.execute(
        text("""
            UPDATE coop.pos_cashier_limit
            SET
                cash_balance = CAST(:cash_balance_after AS numeric),
                updated_at = now()
            WHERE cashier_account = :cashier_account
              AND store_owner_account = :owner_account
        """),
        {
            "cash_balance_after": cash_balance_after,
            "cashier_account": payload.cashier_account,
            "owner_account": owner_account,
        },
    )

    # 8. Журнал движения наличных
    await db.execute(
        text("""
            INSERT INTO coop.pos_cashier_cash_movements (
                transaction_id,
                cashier_account,
                owner_account,
                store_id,
                amount_delta,
                reason,
                cash_balance_before,
                cash_balance_after
            )
            VALUES (
                CAST(:transaction_id AS uuid),
                :cashier_account,
                :owner_account,
                :store_id,
                CAST(:amount_delta AS numeric),
                'cash_topup',
                CAST(:cash_balance_before AS numeric),
                CAST(:cash_balance_after AS numeric)
            )
        """),
        {
            "transaction_id": str(transaction_id),
            "cashier_account": payload.cashier_account,
            "owner_account": owner_account,
            "store_id": payload.store_id,
            "amount_delta": amount,
            "cash_balance_before": cash_balance_before,
            "cash_balance_after": cash_balance_after,
        },
    )

    # 9. Аудит
    await db.execute(
        text("""
            INSERT INTO coop.pos_cashier_actions (
                cashier_account,
                store_id,
                action_type,
                target_type,
                target_id,
                success,
                after_data,
                device_id
            )
            VALUES (
                :cashier_account,
                :store_id,
                'cash_topup',
                'user',
                :target_id,
                TRUE,
                jsonb_build_object(
                    'transaction_id', CAST(:transaction_id AS text),
                    'user_account', CAST(:user_account AS bigint),
                    'owner_account', CAST(:owner_account AS bigint),
                    'amount', CAST(:amount AS numeric),
                    'cash_balance_after', CAST(:cash_balance_after AS numeric),
                    'session_id', CAST(:session_id AS text)
                ),
                :device_id
            )
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
            "target_id": str(payload.user_account),
            "transaction_id": str(transaction_id),
            "user_account": payload.user_account,
            "owner_account": owner_account,
            "amount": amount,
            "cash_balance_after": cash_balance_after,
            "session_id": payload.session_id,
            "device_id": device_id,
        },
    )

    await db.commit()

    return {
        "ok": True,
        "transaction_id": str(transaction_id),
        "user_account": payload.user_account,
        "owner_account": owner_account,
        "amount": float(amount),
        "user_balance_before": float(user_balance_before),
        "user_balance_after": float(user_balance_after),
        "owner_balance_before": float(owner_balance_before),
        "owner_balance_after": float(owner_balance_after),
        "cash_balance_before": float(cash_balance_before),
        "cash_balance_after": float(cash_balance_after),
        "cash_limit": float(cash_limit),
    }
