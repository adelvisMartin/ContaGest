# Post-128 UI stabilization

This follow-up isolates the residual issues found while validating PR #128 after it was merged.

## Scope

- Keep the configuration section navigation visually flat: the Empresa, Apariencia, Integraciones and Respaldo controls must not inherit card elevation.
- Keep the login primary action visible in its resting state through the canonical button variant contract already merged in #128.
- Isolate CAPTCHA header/body/form rows so a refresh icon button cannot overlap a neighboring input under different browser font metrics or viewport heights.
- Defer command-palette route mutation until the current click dispatch has completed, preventing the activated button from being removed while the browser is still delivering the touch/click event.

## Regression contract

`tests/settings_login_ui_regression.test.mjs` asserts the flat navigation, primary button styling, login row geometry rules and deferred command navigation behavior.

## Merge discipline

This branch starts from the current `main` after #128, so it does not reopen the conflict that previously existed in `tests/profile_ui_contract.test.mjs`.
