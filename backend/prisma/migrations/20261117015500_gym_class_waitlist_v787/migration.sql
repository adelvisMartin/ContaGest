-- #787: promote existing GymClassBooking to FIFO waitlist, no parallel agenda.
ALTER TABLE public."GymClassBooking" DROP CONSTRAINT "GymClassBooking_status_check";
ALTER TABLE public."GymClassBooking" ADD CONSTRAINT "GymClassBooking_status_check"
  CHECK ("status" IN ('booked','waitlisted','attended','cancelled','no_show'));
CREATE INDEX "GymClassBooking_tenant_waitlist_fifo_idx"
  ON public."GymClassBooking" ("tenantId","classId","bookedAt","id")
  WHERE "status"='waitlisted';
