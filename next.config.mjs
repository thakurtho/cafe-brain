/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Default is 1MB — too small for a task-proof photo/audio/video
      // upload. Matches the app-side check in app/tasks/actions.ts and the
      // bucket's file_size_limit in the proof-storage migration. Routing
      // the file through the Server Action (rather than uploading straight
      // from the browser to Storage with a signed URL) is the simpler path
      // for this test harness; worth revisiting if larger files or heavier
      // traffic ever matter, since Vercel's own function payload limit is
      // a separate ceiling this config can't raise.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
