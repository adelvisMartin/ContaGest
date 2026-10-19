/** #789 — validate untrusted Express query without broadening the GymExercise authority. */
export function parseGymExerciseFilters(query: unknown) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw new Error('GYM_EXERCISE_FILTER_INVALID');
  }
  const raw = query as Record<string, unknown>;
  const keys = ['q', 'muscleGroup', 'equipment', 'category', 'active'];
  if (Object.keys(raw).some(key => !keys.includes(key))) {
    throw new Error('GYM_EXERCISE_FILTER_INVALID');
  }
  const read = (name: string, limit: number) => {
    const value = raw[name];
    if (value === undefined) return '';
    if (typeof value !== 'string' || value.length > limit ||
        /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error('GYM_EXERCISE_FILTER_INVALID');
    }
    return value.trim();
  };
  const q = read('q', 120);
  const muscleGroup = read('muscleGroup', 120);
  const equipment = read('equipment', 120);
  const category = read('category', 120);
  const active = read('active', 5);
  if (active !== '' && active !== 'true' && active !== 'false') {
    throw new Error('GYM_EXERCISE_FILTER_INVALID');
  }
  return { q, muscleGroup, equipment, category, active };
}
