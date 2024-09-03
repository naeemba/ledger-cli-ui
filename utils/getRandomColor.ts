const getRandomColor = (opacity1: number, opacity2: number) => {
  const r = Math.floor(Math.random() * 255);
  const g = Math.floor(Math.random() * 255);
  const b = Math.floor(Math.random() * 255);
  return [
    `rgba(${r}, ${g}, ${b}, ${opacity1})`,
    `rgba(${r}, ${g}, ${b}, ${opacity2})`,
  ];
};

export default getRandomColor;
