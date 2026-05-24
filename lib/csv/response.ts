import 'server-only';

export const csvDownload = (csv: string, filenameStem: string): Response => {
  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameStem}-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};
