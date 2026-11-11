import { Archive, Users, Sparkles, WandSparkles, LayoutDashboard, ImagePlus, Trash2 } from 'lucide-react'
export const PAGE_ITEMS = [
  { id: 'warehouse', title: '圣遗物仓库', caption: 'PERSONAL COLLECTION', description: '筛选、比较与录入你的五星藏品', icon: Archive },
  { id: 'characters', title: '角色配装', caption: 'CHARACTER WORKSPACE', description: '选择角色，查看五个部位的规则候选', icon: Users },
  { id: 'recommendations', title: '推荐方案', caption: 'RULE-BASED CANDIDATES', description: '查看候选与依据 · 不代表实战最优配装', icon: Sparkles },
  { id: 'queue', title: '强化队列', caption: 'UPGRADE WORKSPACE', description: '最多五件 · 整理队列不删除库存', icon: WandSparkles },
  { id: 'catalog', title: '数据图鉴', caption: 'LOCAL REFERENCE', description: '已核实的五星目录与词条资料 · 本地快照', icon: LayoutDashboard },
  { id: 'assets', title: '本地素材', caption: 'LOCAL PORTRAITS', description: '游戏头像与本机自定义素材', icon: ImagePlus },
  { id: 'trash', title: '回收站', caption: 'RECOVERY WORKSPACE', description: '恢复藏品或明确清空 · 不自动删除', icon: Trash2 },
] as const
export type PageId = typeof PAGE_ITEMS[number]['id']
