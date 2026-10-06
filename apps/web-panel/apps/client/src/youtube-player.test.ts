import { afterEach, expect, it, vi } from "vitest";
import { attachYoutubePlayer, controlYoutube, detachYoutubePlayer, duckYoutube, playYoutube, stopYoutubeForSpotify, youtubePlayerChanged, youtubeSnapshot } from "./youtube-player";
import type { YoutubeVideo } from "@walldeck/contracts";
const video: YoutubeVideo={videoId:"abcdefghijk",title:"Fixture",channelName:"Channel",channelId:"UC1234567890123456789012",durationSeconds:300,publishedAt:"2026-10-06T00:00:00Z",thumbnail:""};
const session="12345678-1234-4234-8234-123456789012";
afterEach(()=>{detachYoutubePlayer();vi.unstubAllGlobals();});
it("waits for actual playback, clamps seeking and restores volume after ducking",async()=>{
  vi.stubGlobal("window",{});let code=1,position=40,volume=70;
  const player={loadVideoById:vi.fn(),playVideo:vi.fn(),pauseVideo:vi.fn(()=>{code=2;}),stopVideo:vi.fn(()=>{code=-1;position=0;}),seekTo:vi.fn((p:number)=>{position=p;}),getCurrentTime:()=>position,getVolume:()=>volume,setVolume:vi.fn((v:number)=>{volume=v;}),getPlayerState:()=>code,destroy:vi.fn()};
  attachYoutubePlayer(player,vi.fn());const playback=playYoutube(video,70,session);
  await Promise.resolve();await Promise.resolve();youtubePlayerChanged("playing");
  expect((await playback).report?.status).toBe("playing");expect(player.loadVideoById).toHaveBeenCalledWith(video.videoId);
  duckYoutube(true);expect(volume).toBe(20);duckYoutube(false);expect(volume).toBe(70);
  controlYoutube("seekBy",-90);expect(position).toBe(0);controlYoutube("seek",999);expect(position).toBe(300);
  controlYoutube("pause");expect(youtubeSnapshot()?.playing).toBe(false);
  stopYoutubeForSpotify();youtubePlayerChanged("loading");expect(youtubeSnapshot()?.status).toBe("stopped");
  expect(youtubeSnapshot()?.positionSeconds).toBe(300);
});
it("reports blocked autoplay honestly and allows a direct tap to resume",async()=>{
  vi.stubGlobal("window",{});
  const play=vi.fn();const player={loadVideoById:vi.fn(),playVideo:play,pauseVideo:vi.fn(),stopVideo:vi.fn(),seekTo:vi.fn(),getCurrentTime:()=>0,getVolume:()=>70,setVolume:vi.fn(),getPlayerState:()=>-1,destroy:vi.fn()};
  attachYoutubePlayer(player,vi.fn());const playback=playYoutube(video,70,session);
  await Promise.resolve();await Promise.resolve();youtubePlayerChanged("blocked");
  expect((await playback).report?.status).toBe("blocked");controlYoutube("resume");expect(play).toHaveBeenCalledOnce();
});
