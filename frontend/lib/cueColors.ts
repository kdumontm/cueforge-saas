export const CUE_COLORS = {
  intro: '#00FF00',
  drop: '#FF0000',
  break: '#0000FF',
  outro: '#FFA500',
  buildup: '#FFFF00',
  verse: '#00FFFF',
  chorus: '#FF00FF',
  default: '#FF0000',
} as const;

export type CueColorKey = keyof typeof CUE_COLORS;
