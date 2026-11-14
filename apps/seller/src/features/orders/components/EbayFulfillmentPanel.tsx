import { useEffect, useMemo, useRef, useState } from 'react';
import { createEbayShippingFulfillment, getEbayShippingFulfillments, type EbayShippingFulfillment } from '../../../api/ebay';
import type { components } from '../../../api/generated/openapi';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';

type ExternalLine = NonNullable<components['schemas']['Order']['external_lines']>[number];

export function EbayFulfillmentPanel({ channelId, externalOrderId, externalLines, coreStatus }: { channelId: string; externalOrderId: string; externalLines: ExternalLine[]; coreStatus: string }) {
  const auth = useAuth();
  const canManage = auth?.user?.role === 'ADMIN';
  const [fulfillments,setFulfillments]=useState<EbayShippingFulfillment[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<unknown>(null);
  const [carrier,setCarrier]=useState('');
  const [tracking,setTracking]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const requestKey=useRef<string|null>(null);
  const availableLines=useMemo(()=>{
    const latest=new Map<string,ExternalLine>();
    for(const line of externalLines) if(line.external_line_id&&!latest.has(line.external_line_id)) latest.set(line.external_line_id,line);
    return [...latest.values()].filter(line=>line.quantity>0);
  },[externalLines]);
  const refresh=()=>{
    const controller=new AbortController();setLoading(true);setError(null);
    void getEbayShippingFulfillments(channelId,externalOrderId,controller.signal).then(setFulfillments).catch(setError).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return ()=>controller.abort();
  };
  useEffect(()=>refresh(),[channelId,externalOrderId]);
  const create=async()=>{
    if(!confirmed||!carrier.trim()||!tracking.trim()||!availableLines.length)return;
    setSubmitting(true);setError(null);
    try{
      requestKey.current??=`ebay-ship-${crypto.randomUUID()}`;
      await createEbayShippingFulfillment(channelId,externalOrderId,{confirm:true,shipping_carrier_code:carrier.trim(),tracking_number:tracking.trim(),line_items:availableLines.map(line=>({line_item_id:line.external_line_id,quantity:line.quantity}))},requestKey.current);
      requestKey.current=null;setConfirmed(false);setCarrier('');setTracking('');await getEbayShippingFulfillments(channelId,externalOrderId).then(setFulfillments);
    }catch(cause){setError(cause)}finally{setSubmitting(false)}
  };
  return <Card className="grid gap-4 p-4 sm:p-5" aria-label="eBay shipping fulfillment">
    <header><h2 className="font-display text-lg font-bold text-on-surface">eBay shipping</h2><p className="mt-1 text-xs leading-5 text-graphite">Trạng thái và tracking lấy từ eBay Fulfillment API; thao tác tạo chỉ hỗ trợ khi đủ điều kiện Sandbox.</p></header>
    {loading?<LoadingState label="Đang đọc fulfillment eBay…"/>:null}
    {!loading&&error&&!fulfillments.length?<ErrorState error={error} retry={refresh}/>:null}
    {!loading&&!error&&!fulfillments.length?<p className="font-body text-caption text-graphite">eBay chưa trả về shipment cho đơn này.</p>:null}
    {fulfillments.map((item,index)=><dl key={item.fulfillmentId??`${item.trackingNumber}-${index}`} className="grid grid-cols-2 gap-3 rounded-control bg-surface-container-low p-3 font-body text-caption"><div><dt className="text-graphite">Remote status</dt><dd className="mt-1"><StatusBadge tone="success">{item.fulfillmentId?'Đã ghi nhận remote':'Đã quan sát'}</StatusBadge></dd></div><div><dt className="text-graphite">Carrier</dt><dd className="mt-1 text-on-surface">{item.shippingCarrierCode??'—'}</dd></div><div><dt className="text-graphite">Tracking</dt><dd className="mt-1 break-all font-mono text-on-surface">{item.trackingNumber??'—'}</dd></div><div><dt className="text-graphite">Ngày gửi</dt><dd className="mt-1 text-on-surface">{item.shippedDate??'—'}</dd></div></dl>)}
    {canManage&&coreStatus==='packed'&&!fulfillments.length?<form className="grid gap-3 rounded-control border border-outline-variant/60 p-3" onSubmit={event=>{event.preventDefault();void create()}}>
      <label className="grid gap-1 text-xs font-semibold text-on-surface">Mã hãng vận chuyển<input required maxLength={32} value={carrier} onChange={event=>setCarrier(event.target.value)} className="min-h-11 rounded-control border border-outline-variant px-3 font-mono"/></label>
      <label className="grid gap-1 text-xs font-semibold text-on-surface">Mã tracking<input required maxLength={128} value={tracking} onChange={event=>setTracking(event.target.value)} className="min-h-11 rounded-control border border-outline-variant px-3 font-mono"/></label>
      <p className="text-xs text-graphite">{availableLines.length?`${availableLines.length} dòng remote sẽ được gửi theo đúng số lượng đã quan sát.`:'Chưa có snapshot line item remote; không thể tạo fulfillment an toàn.'}</p>
      <label className="flex items-start gap-2 text-xs text-on-surface"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Tôi xác nhận đã bàn giao đơn này cho hãng vận chuyển.</label>
      <Button type="submit" size="sm" loading={submitting} disabled={!confirmed||!availableLines.length}>Gửi eBay shipping fulfillment</Button>
    </form>:null}
    {error&&fulfillments.length?<p role="alert" className="text-xs text-danger">{error instanceof Error?error.message:'Không thể đối soát fulfillment eBay.'}</p>:null}
  </Card>;
}
