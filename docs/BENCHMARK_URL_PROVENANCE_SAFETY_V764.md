# #764 — Guard de enlaces de procedencia pública

Hallazgo en el validador canónico del benchmark: `isHttps` bloqueaba credenciales en la URL y el parámetro `token`, pero permitía query params como `api_key`, `signature` o hashes `#token`, además de URLs HTTPS de servidores internos. La matriz se usa como recurso visible de investigación; tales enlaces no deben quedar almacenados ni publicados por una comprobación superficial de HTTPS.

Este PR endurece **la misma función de validación**, utilizada por sources, license evidence y feature evidence, para exigir URLs HTTPS sin credenciales, query, fragment, IP literales ni hosts locales/internos. No altera la lista de proveedores, su clasificación, las afirmaciones de licencia o código de producción. Las fuentes del manifiesto actual permanecen válidas, sin copiar código de terceros. Las comprobaciones de DNS/SSRF a nivel de petición HTTP NO existen en este script; no usarlo como validador de llamadas externas.

Criterios sin cerrar en #764: identidad/licencia de Ecologic, afirmaciones PROVISIONAL, contraste contra runtime real, legal #656. Este es un guard de procedencia, no prueba de disponibilidad o licencia externa. Sin cambios DB/API/UI; requiere CI exact-head y revisión del owner antes del merge. SOURCE_REUSE=NONE.
