-- ContaGest v11.15
-- Backend-only data plane: remove direct PostgREST access for browser roles.
-- The web frontend talks to BackendApi; Prisma/server roles retain DB access.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'AccountingRule','AddressGeocode','AiConversation','AnalyticsEvent','AuditLog','AuthLoginAttempt',
    'BankAccount','BankMovement','CareAppointment','CareCommunicationLog','CareConsent','CareDiagnosticStudy',
    'CareEncounter','CareHospitalObservation','CareHospitalization','CareImmunization','CareLabOrder','CareLabResult',
    'CareMeasurement','CarePatient','CarePrescription','CareProcedure','CareProfessional','ChartAccount','Client',
    'ClosingPeriod','CommunicationTemplate','CoordinateCard','CoordinateChallenge','DemoAccess','Employee','FiscalDocument',
    'FoodOrder','FoodOrderItem','GymAssessment','GymCheckIn','GymClass','GymClassBooking','GymExercise','GymMeal',
    'GymMember','GymMembership','GymMembershipPlan','GymNutritionPlan','GymPayment','GymRoutine','GymRoutineExercise',
    'GymTrainer','HrParameter','ImportBatch','InventoryMovement','LedgerEntry','LedgerLine','LicenseActivation','LicenseKey',
    'ModuleRecord','NotificationLog','OrderEvent','PayrollPeriod','PayrollReceipt','Permission','Product','ProductCode',
    'PurchaseInvoice','PurchaseInvoiceLine','RegulatoryFeed','Role','RolePermission','SalesInvoice','SalesInvoiceLine',
    'Supplier','TaxDeclaration','TaxPeriod','Tenant','UserProfile','UserRole'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', t);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;
