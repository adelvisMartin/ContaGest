/** Gym status guard shared by the existing persisted membership API. */
export function assertGymMembershipTransition({current,target,memberStatus,startsAt,endsAt,now,otherActiveCount}) {
  const states = new Set(['pending','active','frozen','expired','cancelled']);
  if (!states.has(current) || !states.has(target) || !Number.isSafeInteger(otherActiveCount) || otherActiveCount < 0)
    throw new TypeError('GYM_MEMBERSHIP_STATE_INVALID');
  if (current === 'cancelled' && target !== 'cancelled')
    throw new TypeError('GYM_MEMBERSHIP_CANCELLED_FINAL');
  if (target !== 'active') return true;
  if (memberStatus !== 'active') throw new TypeError('GYM_MEMBERSHIP_MEMBER_NOT_ACTIVE');
  if (![startsAt,endsAt,now].every(date => date instanceof Date && Number.isFinite(date.getTime())) ||
      startsAt > now || endsAt <= now)
    throw new TypeError('GYM_MEMBERSHIP_PERIOD_INVALID');
  if (otherActiveCount > 0) throw new TypeError('GYM_MEMBERSHIP_ALREADY_ACTIVE');
  return true;
}
