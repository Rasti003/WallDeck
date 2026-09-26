import { useEffect, useState } from "react";

export function useLandscape() {
  const [landscape, setLandscape] = useState(() => matchMedia("(orientation: landscape)").matches);
  useEffect(() => {
    const media = matchMedia("(orientation: landscape)");
    const update = () => setLandscape(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return landscape;
}

export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
