/** The red "Unable to log in" / "Connection error" banner from the Figma error states. */
export function AuthErrorBanner({
    title,
    message,
}: {
    title: string;
    message: string;
}) {
    return (
        <div className="flex items-start gap-[12px] rounded-[10px] bg-[#fff0f0] px-[16px] py-[12px]">
            <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[#eb0000] text-xs text-[#eb0000] leading-none">
                !
            </div>
            <div className="flex flex-col gap-[4px]">
                <p className="font-ibmplex text-sm font-bold text-black">
                    {title}
                </p>
                <p className="font-ibmplex text-sm text-black">{message}</p>
            </div>
        </div>
    );
}
