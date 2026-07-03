"""Sandbox regression tests — lock in what AI-generated code patterns must be
accepted vs. rejected. Adding a new safe builtin / AST node? Add a green-path
test. Tightening the sandbox? Make sure the existing green paths still pass.

Run from the worker dir: ./.venv/bin/python -m pytest tests/test_sandbox.py -v
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
import re as _re

from app.main import (
    _SAFE_BUILTINS,
    _maybe_unflatten,
    _run_custom_transform,
    _validate_custom_expression,
)


def _ok(src: str) -> None:
    err = _validate_custom_expression(src)
    assert err is None, f"expected to pass, got: {err}\n---\n{src}"


def _rejected(src: str, contains: str) -> None:
    err = _validate_custom_expression(src)
    assert err is not None, f"expected rejection containing {contains!r}, but it passed"
    assert contains.lower() in err.lower(), f"expected error to contain {contains!r}, got: {err}"


# === Patterns the AI naturally writes — these MUST pass ===

def test_fstring_in_lambda():
    _ok("df['x'] = df['y'].apply(lambda s: f'prefix-{s}')")


def test_next_in_generator():
    _ok("df['x'] = df['y'].apply(lambda s: next((c for c in s if c.isdigit()), ''))")


def test_try_except_with_specific_exceptions():
    _ok(
        "def safe(v):\n"
        "    try:\n"
        "        return int(v)\n"
        "    except (ValueError, TypeError):\n"
        "        return 0\n"
        "df['n'] = df['a'].apply(safe)"
    )


def test_unicode_errors_for_mojibake():
    # The exact pattern Gemini emits to fix mojibake — must validate clean.
    _ok(
        "def fix(t):\n"
        "    if isinstance(t, str):\n"
        "        try:\n"
        "            return t.encode('latin1').decode('utf-8')\n"
        "        except (UnicodeEncodeError, UnicodeDecodeError):\n"
        "            return t\n"
        "    return t\n"
        "df['x'] = df['y'].apply(fix)"
    )


def test_for_loop_over_columns():
    _ok(
        "for col in ['a', 'b', 'c']:\n"
        "    if col in df.columns:\n"
        "        df[col] = df[col].astype(str).str.strip()"
    )


def test_dict_lookup_with_fallback_next():
    _ok(
        "PREFIX = {'US': '1', 'AE': '971'}\n"
        "key = 'UNITED ARAB EMIRATES'\n"
        "prefix = PREFIX.get(key) or next((p for k, p in PREFIX.items() if k in key), '')"
    )


def test_walrus_operator():
    _ok("df['x'] = df['y'].apply(lambda s: r if (r := s.strip()) else '')")


def test_isinstance_and_type():
    _ok("df['x'] = df['y'].apply(lambda v: str(v) if not isinstance(v, str) else v)")


def test_chr_ord_hex_oct_bin():
    _ok("df['x'] = df['y'].apply(lambda c: f'{ord(c):x}')")


# === Patterns that MUST be rejected — the security boundary ===

def test_imports_rejected():
    _rejected("import os", "AST node")


def test_from_imports_rejected():
    _rejected("from os import path", "AST node")


def test_underscore_attr_rejected():
    _rejected("x = df.__class__", "underscore attribute")


def test_getattr_rejected():
    _rejected("x = getattr(df, '__class__')", "Disallowed name: getattr")


def test_setattr_rejected():
    _rejected("setattr(df, 'x', 1)", "Disallowed name: setattr")


def test_open_rejected():
    _rejected("open('/etc/passwd')", "Disallowed name: open")


def test_eval_rejected():
    _rejected("eval('1+1')", "Disallowed name: eval")


def test_exec_rejected():
    _rejected("exec('print(1)')", "Disallowed name: exec")


def test_class_rejected():
    _rejected("class Foo: pass", "AST node")


def test_with_rejected():
    _rejected("with x as y:\n    pass", "AST node")


# === Unflattener — Gemini's collapsed-function-body output ===

def test_unflatten_collapsed_def_body():
    """The exact pattern test 5 hit — def body flattened to one line."""
    flat = (
        "def fix(t):    if isinstance(t, str):        try:            "
        "return t.encode('latin1').decode('utf8')        except (UnicodeEncodeError, UnicodeDecodeError):            "
        "return t    return t\n"
        "df['x'] = df['y'].apply(fix)"
    )
    fixed = _maybe_unflatten(flat)
    assert "\n    if isinstance" in fixed
    assert "\n        try:" in fixed
    _ok(fixed)


def test_unflatten_leaves_valid_code_alone():
    good = "df['x'] = df['y'].str.strip()"
    assert _maybe_unflatten(good) == good


def test_unflatten_failure_returns_original():
    """If the heuristic can't fix the code, original error must still surface."""
    bad = "def x("  # truly malformed
    assert _maybe_unflatten(bad) == bad


# === End-to-end execution against a real DataFrame ===

def test_mojibake_actually_decodes():
    """The full code path: unflatten → validate → exec → result correct."""
    flat = (
        "def fix(t):    if isinstance(t, str):        try:            "
        "return t.encode('latin1').decode('utf-8')        except (UnicodeEncodeError, UnicodeDecodeError):            "
        "return t    return t\n"
        "df['Address'] = df['Address'].apply(fix)"
    )
    df = pd.DataFrame({"Address": ["Ø´Ø§Ø±Ø¹ 10, Abu Dhabi"]}, dtype=str)
    result = _run_custom_transform(df, flat)
    assert result["Address"].iloc[0] == "شارع 10, Abu Dhabi"


def test_phone_e164_formatting():
    expr = (
        "PREFIX = {'UNITED ARAB EMIRATES': '971', 'INDIA': '91', 'US': '1'}\n"
        "def fmt(phone, country):\n"
        "    if not isinstance(phone, str): return ''\n"
        "    digits = re.sub(r'[^0-9]', '', phone)\n"
        "    if not digits: return ''\n"
        "    key = (country or '').strip().upper()\n"
        "    prefix = PREFIX.get(key) or next((p for k, p in PREFIX.items() if k in key), '')\n"
        "    if prefix and digits.startswith(prefix): return f'+{digits}'\n"
        "    if prefix: return f'+{prefix}{digits}'\n"
        "    return f'+{digits}'\n"
        "df['Formatted'] = df.apply(lambda r: fmt(r.get('Phone'), r.get('Country')), axis=1)"
    )
    df = pd.DataFrame(
        {"Phone": ["+971 4 259 9442", "(212) 555-1234"], "Country": ["United Arab Emirates", "US"]},
        dtype=str,
    )
    result = _run_custom_transform(df, expr)
    assert result["Formatted"].iloc[0] == "+97142599442"
    assert result["Formatted"].iloc[1] == "+12125551234"


def test_safe_builtins_still_locked_down():
    """Sanity check: dangerous builtins must NOT have leaked into the sandbox."""
    forbidden = ["open", "exec", "eval", "compile", "__import__", "globals", "locals", "getattr", "setattr"]
    for name in forbidden:
        assert name not in _SAFE_BUILTINS, f"{name} leaked into _SAFE_BUILTINS"
