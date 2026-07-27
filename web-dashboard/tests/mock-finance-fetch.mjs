globalThis.fetch = async (_url, options) => {
  if (options?.headers?.Authorization !== `Bearer ${process.env.EXPECTED_FINANCE_TOKEN}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized.' }), { status: 401 });
  }
  return Response.json({
    schemaVersion: 1,
    freshness: { status: 'fresh' },
    positions: [],
  });
};
