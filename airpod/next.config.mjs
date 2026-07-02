/** @type {import('next').NextConfig} */
const nextConfig = {
  // 파이프라인이 child_process(git/docker)를 쓰므로 서버 액션/route에서 Node 런타임 사용
  serverExternalPackages: [],
};

export default nextConfig;
