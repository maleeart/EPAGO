export default function handler(req, res) {
  const isOnline = !!process.env.BLOB_READ_WRITE_TOKEN;
  res.status(200).json({ ok: true, online: isOnline });
}
