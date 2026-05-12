const hash = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

const getColor = (seed: string, opacity1: number, opacity2: number) => {
  const h = hash(seed);
  const r = h % 256;
  const g = (h >> 8) % 256;
  const b = (h >> 16) % 256;
  return [
    `rgba(${r}, ${g}, ${b}, ${opacity1})`,
    `rgba(${r}, ${g}, ${b}, ${opacity2})`,
  ];
};

export default getColor;
