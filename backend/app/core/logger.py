import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.core.config import APP_ENV


def setup_logger():
    logger = logging.getLogger()

    # очищаем старые хендлеры (важно при reload)
    if logger.handlers:
        logger.handlers.clear()

    logger.setLevel(logging.INFO)

    # папка логов
    base_dir = Path(__file__).resolve().parent.parent
    log_dir = base_dir / "logs"
    log_dir.mkdir(exist_ok=True)

    log_file = log_dir / "pos_api.log"

    # файл
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.INFO)

    # консоль
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)

    # формат
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )

    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    logger.info(f"Logger initialized (env={APP_ENV})")

    return logger