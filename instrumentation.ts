export const register = async (): Promise<void> => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registerPriceCron } = await import('@/lib/prices/scheduler');
  registerPriceCron();
};
