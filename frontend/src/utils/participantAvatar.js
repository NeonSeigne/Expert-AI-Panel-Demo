import { avatarColorForIndex } from '../components/ParticipantDirectoryCard';
import { HUMAN_COLOR } from '../constants/brandColors';

export function avatarColorForParticipant(participant, index) {
  if (participant?.kind === 'human') return HUMAN_COLOR;
  return avatarColorForIndex(index);
}
