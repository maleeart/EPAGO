export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  const isOnline = !!process.env.BLOB_READ_WRITE_TOKEN;
  res.status(200).json({ ok: true, online: isOnline });
}
