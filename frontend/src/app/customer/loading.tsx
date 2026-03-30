import Image from 'next/image';

export default function CustomerLoading() {
  return (
    <main className="portal-shell flex min-h-screen items-center justify-center px-4 py-6">
      <div className="portal-card w-full max-w-sm p-6 text-center sm:p-7">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] border border-white/10 bg-white/[0.04]">
          <Image
            src="/brand/logo-moka-solar.png"
            alt="Moka Solar"
            width={56}
            height={56}
            className="h-14 w-auto object-contain"
            priority
          />
        </div>
        <p className="mt-5 text-[11px] uppercase tracking-[0.28em] text-slate-500">Moka Solar</p>
        <h1 className="mt-3 text-xl font-semibold text-white">Đang mở cổng khách hàng</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Hệ thống đang chuẩn bị dữ liệu sản lượng, hóa đơn và trạng thái vận hành gần nhất cho bạn.
        </p>
      </div>
    </main>
  );
}
