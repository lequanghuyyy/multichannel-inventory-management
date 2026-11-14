import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLazadaCategories, getLazadaCategoryAttributes, type LazadaCategory, type LazadaCategoryAttribute } from '../../../api/lazada';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';

type Leaf = { id: number; path: string };

function leaves(nodes: LazadaCategory[], parent = '', output: Leaf[] = []): Leaf[] {
  for (const node of nodes) {
    const path = parent ? `${parent} › ${node.name}` : node.name;
    if (node.leaf && Number.isSafeInteger(node.category_id) && node.category_id > 0) output.push({ id: node.category_id, path });
    else if (Array.isArray(node.children)) leaves(node.children, path, output);
  }
  return output;
}

const mandatory = (value: LazadaCategoryAttribute['is_mandatory']) => value === 1 || value === '1' || value === true;
function suggestionScore(path: string, categoryTerms: string[], nameTerms: string[]): number {
  const lower = path.toLocaleLowerCase('vi');
  const leaf = lower.split(' › ').at(-1) ?? lower;
  return categoryTerms.reduce((score, term) => score + (leaf.includes(term) ? 5 : lower.includes(term) ? 3 : 0), 0)
    + nameTerms.reduce((score, term) => score + (leaf.includes(term) ? 2 : lower.includes(term) ? 1 : 0), 0);
}

const searchTerms = (value: string) => [...new Set(value.toLocaleLowerCase('vi').split(/[^\p{L}\p{N}]+/u).filter((term) => term.length >= 3))];
const fashionProduct = (category: string, name: string) => /(thời trang|quần|áo|váy|đầm|giày|dép|trang phục|đồ lót|túi xách)/i.test(`${category} ${name}`);
const fashionRoot = (path: string) => /(thời trang|quần áo|giày|dép|trang phục|đồ lót|túi xách)/i.test(path.split(' › ')[0] ?? '');

export function LazadaCategoryPanel({ channelId, productName, coreCategory, selectedCategoryId, onSelect, onAttributes }: {
  channelId: string; productName?: string; coreCategory?: string; selectedCategoryId?: string;
  onSelect?: (id: string, path: string, attributes: LazadaCategoryAttribute[]) => void;
  onAttributes?: (attributes: LazadaCategoryAttribute[]) => void;
}) {
  const [tree, setTree] = useState<LazadaCategory[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState('');
  const [treeAttempt, setTreeAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [attributes, setAttributes] = useState<LazadaCategoryAttribute[]>([]);
  const [attributesLoading, setAttributesLoading] = useState(false);
  const [attributesError, setAttributesError] = useState('');
  const attributeCache = useRef(new Map<string, LazadaCategoryAttribute[]>());
  const requestSeq = useRef(0);
  const selectionSeq = useRef(0);
  const cacheKey = useCallback((categoryId: string) => `${channelId}:${categoryId}`, [channelId]);

  const options = useMemo(() => {
    const seen = new Set<number>();
    return leaves(tree).filter((leaf) => {
      if (seen.has(leaf.id)) return false;
      seen.add(leaf.id);
      return !fashionProduct(coreCategory ?? '', productName ?? '') || fashionRoot(leaf.path);
    });
  }, [coreCategory, productName, tree]);
  const byId = useMemo(() => new Map(options.map((leaf) => [leaf.id, leaf])), [options]);
  const selected = selectedCategoryId ? byId.get(Number(selectedCategoryId)) : undefined;
  const filtered = useMemo(() => {
    const term = debouncedQuery.trim().toLocaleLowerCase('vi');
    if (!term) return [];
    return options.filter((item) => item.path.toLocaleLowerCase('vi').includes(term)).slice(0, 20);
  }, [debouncedQuery, options]);
  const required = attributes.filter((item) => mandatory(item.is_mandatory));
  const categoryTerms = useMemo(() => searchTerms(coreCategory ?? ''), [coreCategory]);
  const nameTerms = useMemo(() => searchTerms(productName ?? ''), [productName]);
  const coreMatches = useMemo(() => {
    if (!categoryTerms.length && !nameTerms.length) return [];
    return options.map((leaf) => ({ leaf, score: suggestionScore(leaf.path, categoryTerms, nameTerms) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.leaf.path.length - b.leaf.path.length)
      .slice(0, 8).map(({ leaf }) => leaf);
  }, [categoryTerms, nameTerms, options]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setTreeLoading(true);
    setTreeError('');
    void getLazadaCategories(channelId, controller.signal).then((result) => {
      if (!controller.signal.aborted) setTree(Array.isArray(result.data) ? result.data : []);
    }).catch(() => {
      if (!controller.signal.aborted) setTreeError('Không đọc được cây ngành hàng Lazada VN. Kiểm tra kết nối và quyền Product API.');
    }).finally(() => {
      if (!controller.signal.aborted) setTreeLoading(false);
    });
    return () => controller.abort();
  }, [channelId, treeAttempt]);

  const readAttributes = useCallback(async (categoryId: string): Promise<LazadaCategoryAttribute[]> => {
    const cached = attributeCache.current.get(cacheKey(categoryId));
    if (cached) return cached;
    const seq = ++requestSeq.current;
    setAttributesLoading(true);
    setAttributesError('');
    try {
      const result = await getLazadaCategoryAttributes(channelId, Number(categoryId));
      const values = Array.isArray(result.data) ? result.data : [];
      attributeCache.current.set(cacheKey(categoryId), values);
      if (seq === requestSeq.current) {
        setAttributes(values);
        setAttributesLoading(false);
        onAttributes?.(values);
      }
      return values;
    } catch {
      if (seq === requestSeq.current) {
        setAttributes([]);
        setAttributesLoading(false);
        setAttributesError('Không đọc được thuộc tính của ngành hàng này. Thử lại hoặc chọn ngành hàng khác.');
      }
      throw new Error('CATEGORY_ATTRIBUTES_UNAVAILABLE');
    }
  }, [cacheKey, channelId, onAttributes]);

  // Runs before the selection effect below so a channel switch never reuses another
  // channel's cached attributes.
  useEffect(() => {
    attributeCache.current.clear();
    requestSeq.current += 1;
    setAttributes([]);
    setAttributesLoading(false);
  }, [channelId]);

  useEffect(() => {
    // Clear the previous category immediately: its attributes and errors must not
    // look like they belong to the newly selected Lazada category.
    setAttributes([]);
    setAttributesError('');
    if (!selectedCategoryId) {
      setAttributesLoading(false);
      onAttributes?.([]);
      return;
    }
    const cached = attributeCache.current.get(cacheKey(selectedCategoryId));
    if (cached) {
      setAttributes(cached);
      setAttributesLoading(false);
      onAttributes?.(cached);
      return;
    }
    onAttributes?.([]);
    void readAttributes(selectedCategoryId).catch(() => {});
  }, [cacheKey, onAttributes, readAttributes, selectedCategoryId]);

  const choose = async (leaf: Leaf) => {
    const selection = ++selectionSeq.current;
    setAttributes([]);
    setAttributesError('');
    onAttributes?.([]);
    try {
      const values = await readAttributes(String(leaf.id));
      if (selection === selectionSeq.current) onSelect?.(String(leaf.id), leaf.path, values);
    } catch {
      // The inline attribute error explains the failure; do not select an unverified category.
    }
  };

  return <Card className="grid gap-4 p-5">
    <h3 className="font-display text-base font-bold text-on-surface">Ngành hàng Lazada</h3>

    {treeLoading ? <div className="grid gap-2" aria-busy="true"><div className="h-11 animate-pulse rounded-control bg-surface-container-low" /><div className="h-24 animate-pulse rounded-control bg-surface-container-low" /><p className="text-xs text-graphite">Đang tải ngành hàng từ Lazada…</p></div> : null}
    {!treeLoading && treeError ? <div role="alert" className="grid gap-2 rounded-lg border border-error/20 bg-error-container/30 p-3 text-sm text-error"><span>{treeError}</span><Button size="sm" variant="secondary" className="justify-self-start" onClick={() => setTreeAttempt((value) => value + 1)}>Thử lại</Button></div> : null}
    {!treeLoading && !treeError && options.length === 0 ? <p className="rounded-lg border border-outline-variant bg-warm-alabaster p-3 text-sm text-graphite">Lazada chưa trả về ngành hàng cuối nào cho gian hàng này.</p> : null}

    {!treeLoading && !treeError && options.length > 0 ? <div className="grid gap-3">
      <Input aria-label="Tìm ngành hàng Lazada" label="Tìm ngành hàng Lazada" placeholder="Tên hoặc đường dẫn ngành hàng" value={query} onChange={(event) => setQuery(event.target.value)} />
      {coreMatches.length && !query.trim() ? <div className="grid gap-2 rounded-lg border border-outline-variant bg-warm-alabaster p-3"><strong className="text-xs font-semibold text-on-surface">Gợi ý ngành hàng phù hợp</strong>{coreMatches.map((leaf) => <button key={leaf.id} type="button" className="rounded-control border border-outline-variant bg-pure-white px-3 py-2 text-left text-sm hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-octo-ember" onClick={() => void choose(leaf)}>{leaf.path}</button>)}</div> : null}
      {filtered.length ? <div className="max-h-56 overflow-y-auto rounded-control border border-outline-variant/60">{filtered.map((leaf) => <button key={leaf.id} type="button" aria-pressed={selected?.id === leaf.id} className={`block w-full border-b border-outline-variant/40 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-octo-ember ${selected?.id === leaf.id ? 'bg-surface-container-low font-semibold' : ''}`} onClick={() => void choose(leaf)}>{leaf.path}</button>)}</div> : query.trim() && debouncedQuery === query ? <p className="rounded-lg border border-outline-variant bg-warm-alabaster p-3 text-sm text-graphite">Không có ngành hàng cuối phù hợp. Thử từ khóa khác.</p> : null}
    </div> : null}

    {selectedCategoryId ? <div className="grid gap-2 border-t border-outline-variant/50 pt-4">
      {attributesLoading ? <p className="text-xs text-graphite">Đang tải thuộc tính bắt buộc của ngành hàng…</p> : null}
      {attributesError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-error/20 bg-error-container/30 p-3 text-sm text-error"><span>{attributesError}</span><Button size="sm" variant="secondary" onClick={() => { attributeCache.current.delete(cacheKey(selectedCategoryId)); void readAttributes(selectedCategoryId).catch(() => {}); }}>Thử lại</Button></div> : null}
      {selected ? <h4 className="text-sm font-semibold text-on-surface">Đã chọn: {selected.path}</h4> : null}
      {!selected && !treeLoading && !treeError ? <p role="status" className="text-sm text-badge-blocked-text">Ngành hàng đã lưu không còn trong cây Lazada hiện tại. Chọn lại ngành hàng cuối.</p> : null}
      {required.length ? <div className="grid gap-3 sm:grid-cols-2">{(['normal', 'sku'] as const).map((level) => <div key={level}><strong className="text-xs text-graphite">{level === 'normal' ? 'Cấp sản phẩm' : 'Từng SKU'}</strong><ul className="mt-1 list-inside list-disc text-sm text-on-surface">{required.filter((item) => item.attribute_type === level).map((item) => <li key={`${level}:${item.name}`}>{item.label || item.name}</li>)}</ul></div>)}</div> : null}
      {!attributesLoading && !attributesError && selected && !required.length ? <p className="text-xs text-graphite">Ngành hàng này không có thuộc tính bắt buộc bổ sung.</p> : null}
    </div> : null}
  </Card>;
}
