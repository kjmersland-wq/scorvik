import { CreateStudio } from "@/components/create-studio";
import type { VideoFormat, VideoSettings } from "@/types/project";

interface CreatePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NorwegianCreatePage({ searchParams }: CreatePageProps) {
  const params = await searchParams;
  const formatValue = params.format;
  const format = typeof formatValue === "string" && ["16:9", "9:16", "4:5", "1:1"].includes(formatValue) ? formatValue as VideoFormat : undefined;
  const durationValue = Number(params.duration);
  const duration = [15, 20, 30, 45, 60, 90, 120, 180].includes(durationValue) ? durationValue : undefined;
  const platform = typeof params.platform === "string" ? params.platform : undefined;
  const initialSettings: Partial<VideoSettings> = { format, duration, language: "Norsk", platformPresetIds: platform ? [platform] : undefined };
    return <CreateStudio locale="no" initialSettings={initialSettings} />;
}