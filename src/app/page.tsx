import { TransferApp } from '@/components/transfer-app'

export default function HomePage() {
  // 页面本身是服务器组件；所有浏览器 API 都收敛在 TransferApp 的 useEffect 中
  return <TransferApp />
}
