import PersonDebts from '@/features/debts/PersonDebts';

const Report = async ({ params }: { params: Promise<{ person: string }> }) => {
  const { person } = await params;
  return <PersonDebts person={decodeURIComponent(person)} />;
};

export default Report;
