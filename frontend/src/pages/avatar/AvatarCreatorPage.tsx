import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, RotateCcw, Sparkles, UserRound } from "lucide-react";
import { axiosInstance } from "@/lib/axios";
import { avatarUrl, type AvatarConfig } from "@/lib/avatar";
import { Button } from "@/components/ui/button";
import { usePhotoActions } from "@/components/profile/usePhotoActions";
import { useMyProfile } from "@/hooks/useMyProfile";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const choices: Record<string, string[]> = {
  skinColor: ["f2d3b1", "ecad80", "c68642", "8d5524"], hair: ["short01", "long01", "bob", "curly", "dreads01", "frizzle"], hairColor: ["2c1b18", "724133", "a55728", "b58143", "e8e1e1"], eyes: ["default", "happy", "side", "squint", "hearts"], eyebrows: ["default", "raised", "sadConcerned", "unibrowNatural"], mouth: ["default", "smile", "serious", "twinkle", "tongue"], facialHair: ["none", "beardMedium", "moustacheFancy", "beardLight"], glasses: ["none", "round", "wayfarers", "prescription01"], accessories: ["none", "kurt", "round", "wayfarers"], clothing: ["hoodie", "graphicShirt", "blazerAndShirt", "overall", "shirtCrewNeck", "collarAndSweater"], clothingColor: ["65c9ff", "5199e4", "25557c", "ff488e", "a7ffc4", "ffdbb4"], shoes: ["sneakers", "boots", "canvas", "loafers"], hat: ["none", "beanie", "hijab", "turban"], jewelry: ["none", "studs", "hoops", "chain"], backgroundColor: ["f0f9ff", "fdf2f8", "ecfdf5", "fff7ed", "ede9fe"],
};
const genderChoices: Record<AvatarConfig["gender"], Partial<Record<string, string[]>>> = {
  male: {
    hair: ["short01", "curly", "dreads01", "frizzle"],
    clothing: ["hoodie", "graphicShirt", "blazerAndShirt", "shirtCrewNeck"],
    facialHair: ["none", "beardMedium", "moustacheFancy", "beardLight"],
    hat: ["none", "beanie", "turban"],
    jewelry: ["none", "studs", "chain"],
  },
  female: {
    hair: ["long01", "bob", "curly", "frizzle"],
    clothing: ["hoodie", "graphicShirt", "overall", "collarAndSweater"],
    facialHair: ["none"],
    hat: ["none", "beanie", "hijab"],
    jewelry: ["none", "studs", "hoops", "chain"],
  },
};
const labels: Record<string, string> = { skinColor: "Skin", hair: "Hairstyle", hairColor: "Hair colour", eyes: "Eyes", eyebrows: "Brows", mouth: "Expression", facialHair: "Facial hair", glasses: "Glasses", accessories: "Accessories", clothing: "Outfit", clothingColor: "Outfit colour", shoes: "Shoes", hat: "Headwear", jewelry: "Jewellery", backgroundColor: "Backdrop" };
const sections = [
  { title: "Face", keys: ["skinColor", "eyes", "eyebrows", "mouth", "facialHair", "glasses"] },
  { title: "Hair", keys: ["hair", "hairColor", "hat"] },
  { title: "Style", keys: ["clothing", "clothingColor", "shoes", "jewelry", "accessories"] },
  { title: "Scene", keys: ["backgroundColor"] },
];
const defaultConfig: AvatarConfig = { gender: "female", options: Object.fromEntries(Object.entries(choices).map(([key, options]) => [key, options[0]])) };

const AvatarCreatorPage = () => {
  const { user } = useUser();
  const [config, setConfig] = useState<AvatarConfig>(defaultConfig);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [activeKey, setActiveKey] = useState("skinColor");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();
  const { setAvatarAsPhoto, chooseSource } = usePhotoActions();
  const avatarIsPhoto = profile?.photo?.source === "avatar";
  // Starts as whatever the profile uses now; the choice applies when saving.
  const [useAsPhotoChoice, setUseAsPhotoChoice] = useState<boolean | null>(null);
  const useAsPhoto = useAsPhotoChoice ?? avatarIsPhoto;

  useEffect(() => {
    axiosInstance.get("/avatars/me").then(({ data }) => data && setConfig({ gender: data.gender, options: { ...defaultConfig.options, ...data.options } })).catch(() => undefined);
  }, []);

  const section = sections[sectionIndex];
  const activeChoices = genderChoices[config.gender][activeKey] || choices[activeKey];
  const image = useMemo(() => avatarUrl(config, user?.id || "beatbond"), [config, user?.id]);
  const previewFor = (value: string) => avatarUrl({ ...config, options: { ...config.options, [activeKey]: value } }, user?.id || "beatbond");
  const selectSection = (index: number) => { setSectionIndex(index); setActiveKey(sections[index].keys[0]); };
  const update = (value: string) => setConfig((current) => ({ ...current, options: { ...current.options, [activeKey]: value } }));
  const setGender = (gender: AvatarConfig["gender"]) => setConfig((current) => {
    const allowed = genderChoices[gender];
    const options = { ...current.options };
    Object.entries(allowed).forEach(([key, values]) => {
      if (values && !values.includes(options[key])) options[key] = values[0];
    });
    return { gender, options };
  });
  const save = async () => {
    setSaving(true);
    try {
      await axiosInstance.put("/avatars/me", config);
      queryClient.setQueryData(["myAvatar"], config);
      if (useAsPhoto) {
        // Keeps the profile photo matching the avatar after every change.
        const updated = await setAvatarAsPhoto(config, null);
        toast.success(updated ? (avatarIsPhoto ? "Avatar and profile photo updated" : "Your avatar is now your profile photo") : "Avatar saved");
      } else if (avatarIsPhoto) {
        // Turned off: go back to the photo they had before.
        const photo = profile?.photo;
        await chooseSource(photo?.uploadedUrl ? "upload" : photo?.providerUrl ? "provider" : "none");
      } else {
        toast.success("Avatar saved");
      }
      setUseAsPhotoChoice(null);
    }
    catch { toast.error("Could not save your avatar"); }
    finally { setSaving(false); }
  };

  return <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
      <span className="size-10" aria-hidden="true" />
      <div className="text-center"><p className="text-sm font-bold">My Avatar</p><p className="text-[10px] text-zinc-500">Make it look like you</p></div>
      <Button size="sm" className="rounded-full px-4" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
    </header>

    <section className="relative flex min-h-[270px] flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_15%,#444_0%,#171717_48%,#000_100%)]">
      <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="absolute left-4 top-4 flex gap-2"><button type="button" onClick={() => setConfig(defaultConfig)} className="grid size-9 place-items-center rounded-full bg-black/25 text-white backdrop-blur hover:bg-black/40" aria-label="Reset avatar"><RotateCcw className="size-4" /></button><span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-3 text-xs font-medium text-white backdrop-blur"><Sparkles className="size-3.5 text-yellow-300" /> Live preview</span></div>
      <div className="relative h-[min(52vw,350px)] min-h-[225px] w-[min(52vw,350px)] min-w-[225px] overflow-hidden rounded-[2.25rem] border-4 border-white/80 bg-white/20 shadow-2xl"><img src={image} alt="Your avatar preview" className="h-full w-full object-cover" /></div>
      <button
        type="button"
        role="switch"
        aria-checked={useAsPhoto}
        onClick={() => setUseAsPhotoChoice(!useAsPhoto)}
        className={cn(
          "absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur transition-colors",
          useAsPhoto ? "bg-primary text-primary-foreground" : "bg-black/25 text-white hover:bg-black/40",
        )}
      >
        {useAsPhoto ? <Check className="size-3.5" /> : <UserRound className="size-3.5" />}
        {useAsPhoto ? "Profile photo" : "Use as profile photo"}
      </button>
      <div className="absolute bottom-4 rounded-full bg-black/25 px-3 py-1 text-xs font-medium text-white backdrop-blur">{config.gender === "female" ? "She / her" : "He / him"}</div>
    </section>

    <section className="relative shrink-0 rounded-t-[2rem] border-t border-border bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+0.8rem)] pt-3 shadow-[0_-10px_30px_rgb(0_0_0/.35)] sm:px-6">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
      <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-bold">Avatar · {labels[activeKey]}</p><p className="text-xs text-muted-foreground">Choose a look you love</p></div><div className="flex rounded-full bg-secondary p-0.5"><button onClick={() => setGender("female")} className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", config.gender === "female" && "bg-background shadow-sm")}>Female</button><button onClick={() => setGender("male")} className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", config.gender === "male" && "bg-background shadow-sm")}>Male</button></div></div>
      <div className="scrollbar-hide -mx-1 mb-3 flex gap-2 overflow-x-auto px-1">{sections.map((item, index) => <button key={item.title} onClick={() => selectSection(index)} className={cn("shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-colors", sectionIndex === index ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{item.title}</button>)}</div>
      <div className="scrollbar-hide -mx-1 mb-3 flex gap-2 overflow-x-auto px-1">{section.keys.map((key) => <button key={key} onClick={() => setActiveKey(key)} className={cn("shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium", activeKey === key ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>{labels[key]}</button>)}</div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">{activeChoices.map((value) => <button key={value} type="button" aria-label={`Choose ${value}`} aria-pressed={config.options[activeKey] === value} onClick={() => update(value)} className={cn("aspect-square overflow-hidden rounded-xl border-2 bg-secondary transition-transform active:scale-95", config.options[activeKey] === value ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-muted-foreground/50")}><img src={previewFor(value)} alt="" className="h-full w-full object-cover" /></button>)}</div>
      <div className="mt-3 flex items-center justify-between border-t pt-3"><Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfig(defaultConfig)}><RotateCcw className="mr-1.5 size-4" />Reset</Button><div className="flex gap-2"><Button variant="outline" size="sm" disabled={sectionIndex === 0} onClick={() => selectSection(sectionIndex - 1)}><ChevronLeft className="size-4" /></Button>{sectionIndex < sections.length - 1 ? <Button size="sm" onClick={() => selectSection(sectionIndex + 1)}>Next <ChevronRight className="ml-1 size-4" /></Button> : <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : <><Check className="mr-1 size-4" />Done</>}</Button>}</div></div>
    </section>
  </main>;
};

export default AvatarCreatorPage;
