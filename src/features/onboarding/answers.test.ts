import {
  EMPTY_DRAFT,
  FREE_TEXT_MAX_LENGTH,
  toAnswers,
  type OnboardingDraft,
} from './answers';

const ANSWERED: OnboardingDraft = {
  goal: 'both',
  daysPerWeek: 4,
  experience: 'intermediate',
  equipment: 'full-gym',
  constraints: '  left shoulder impingement  ',
  coachingNotes: '  keep the deadlifts  ',
};

describe('toAnswers', () => {
  it('should refuse an untouched draft', () => {
    expect(toAnswers(EMPTY_DRAFT)).toBeNull();
  });

  it('should refuse a draft when one choice is still missing', () => {
    expect(toAnswers({ ...ANSWERED, equipment: null })).toBeNull();
  });

  it('should accept a draft once all five questions are answered', () => {
    expect(toAnswers({ ...ANSWERED, constraints: '', coachingNotes: '' })).toEqual({
      goal: 'both',
      daysPerWeek: 4,
      experience: 'intermediate',
      equipment: 'full-gym',
      constraints: '',
      coachingNotes: '',
    });
  });

  it('should trim the free text so surrounding whitespace never reaches the server', () => {
    expect(toAnswers(ANSWERED)?.constraints).toBe('left shoulder impingement');
  });

  it('should keep coaching notes separate from the constraints answer', () => {
    expect(toAnswers(ANSWERED)?.coachingNotes).toBe('keep the deadlifts');
  });

  it('should cap free text so a pasted document cannot become the request body', () => {
    const pasted = 'x'.repeat(FREE_TEXT_MAX_LENGTH + 100);

    expect(toAnswers({ ...ANSWERED, coachingNotes: pasted })?.coachingNotes).toHaveLength(
      FREE_TEXT_MAX_LENGTH
    );
  });
});
