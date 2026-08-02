-- La tabla contiene señales de autenticación y no debe ser consultable por clientes.
CREATE POLICY "auth_attempts_deny_direct_clients"
ON public."AuthLoginAttempt"
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
