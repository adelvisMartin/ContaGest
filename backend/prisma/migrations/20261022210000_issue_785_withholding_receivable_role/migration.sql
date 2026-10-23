-- #785 payment-withholding receipt role (asset); existing bindings/history unchanged.
ALTER TABLE public."SemanticAccountRoleMapping"
  DROP CONSTRAINT "SemanticAccountRoleMapping_role_check",
  ADD CONSTRAINT "SemanticAccountRoleMapping_role_check" CHECK
    ("role" IN (
      'ar','ap','vat_output','vat_input','withholding_payable','withholding_receivable',
      'payroll_payable','tax_payable','cash','bank','revenue','expense','inventory','asset','cost_of_sales'
    ));
