"""
NEURALVISION // LOGGING
Structured logging with colour-coded levels.
"""

import logging
import sys
from datetime import datetime


class NVFormatter(logging.Formatter):
    """
    Custom formatter: [HH:MM:SS] LEVEL  module  message
    """
    LEVELS = {
        logging.DEBUG:    "\033[90m",    # grey
        logging.INFO:     "\033[36m",    # cyan
        logging.WARNING:  "\033[33m",    # amber
        logging.ERROR:    "\033[31m",    # red
        logging.CRITICAL: "\033[35m",    # magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        colour = self.LEVELS.get(record.levelno, "")
        ts = datetime.fromtimestamp(record.created).strftime("%H:%M:%S")
        level = f"{record.levelname:<8}"
        name = f"{record.name:<24}"
        return f"{colour}[{ts}] {level} {name} {record.getMessage()}{self.RESET}"


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(NVFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)
        logger.propagate = False
    return logger
