//! Common logging utility for Tresr satellite functions.
//!
//! Wraps Juno's custom loggers to provide a consistent `[Component] message` format
//! with proper log levels that appear in the Juno Console UI "Level" column.
//!
//! ## Usage
//! ```rust
//! use crate::logging;
//!
//! logging::log_info("Hooks", &format!("Fee verified for user {}", user_key));
//! logging::log_warn("AntiCheat", &format!("Skipped consolation for banned user {}", key));
//! logging::log_error("EvmRpc", &format!("Balance refresh failed: {}", err));
//! logging::log_debug("Hooks", &format!("Session deserialized OK, score={}", score));
//! ```
//!
//! All logging is best-effort — logger errors are silently ignored so a logging
//! failure never crashes a hook or assertion.

/// Log at DEBUG level. Use for diagnostic/development messages.
pub fn log_debug(component: &str, message: &str) {
    let formatted = format!("[{}] {}", component, message);
    let _ = junobuild_satellite::debug(formatted);
}

/// Log at INFO level. Use for successful operations and state changes.
pub fn log_info(component: &str, message: &str) {
    let formatted = format!("[{}] {}", component, message);
    let _ = junobuild_satellite::info(formatted);
}

/// Log at WARN level. Use for skipped operations or unusual conditions.
pub fn log_warn(component: &str, message: &str) {
    let formatted = format!("[{}] {}", component, message);
    let _ = junobuild_satellite::warn(formatted);
}

/// Log at ERROR level. Use for failed operations and error conditions.
pub fn log_error(component: &str, message: &str) {
    let formatted = format!("[{}] {}", component, message);
    let _ = junobuild_satellite::error(formatted);
}
