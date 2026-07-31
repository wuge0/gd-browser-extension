import { describe, it, expect } from 'vitest';
import {
  isMasterPlaylist,
  isHlsContent,
  parseMasterPlaylist,
  parseMediaPlaylist
} from './hlsParser';

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=640x360,CODECS="avc1.42c01e,mp4a.40.2"
360p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2560000,AVERAGE-BANDWIDTH=2400000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2",FRAME-RATE=30
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080p/index.m3u8
`;

const MEDIA = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:9.009,
seg0.ts
#EXTINF:9.009,
seg1.ts
#EXTINF:3.003,
seg2.ts
#EXT-X-ENDLIST
`;

const MEDIA_ENCRYPTED = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-KEY:METHOD=AES-128,URI="https://example.com/key.bin",IV=0x1234
#EXTINF:10.0,
seg0.ts
#EXTINF:10.0,
seg1.ts
#EXT-X-ENDLIST
`;

describe('hlsParser', () => {
  describe('isMasterPlaylist / isHlsContent', () => {
    it('识别 master playlist', () => {
      expect(isMasterPlaylist(MASTER)).toBe(true);
      expect(isMasterPlaylist(MEDIA)).toBe(false);
    });

    it('识别 HLS 内容', () => {
      expect(isHlsContent(MASTER)).toBe(true);
      expect(isHlsContent('not a playlist')).toBe(false);
    });
  });

  describe('parseMasterPlaylist', () => {
    const variants = parseMasterPlaylist(MASTER, 'https://cdn.example.com/video/master.m3u8');

    it('解析出全部档位', () => {
      expect(variants).toHaveLength(3);
    });

    it('按带宽降序排列', () => {
      expect(variants.map((v) => v.bandwidth)).toEqual([5000000, 2560000, 1280000]);
    });

    it('相对 URI 解析为绝对 URL', () => {
      expect(variants[0].url).toBe('https://cdn.example.com/video/1080p/index.m3u8');
    });

    it('解析分辨率与展示名', () => {
      const v720 = variants.find((v) => v.resolution === '1280x720');
      expect(v720?.name).toBe('720p');
      expect(v720?.frameRate).toBe(30);
    });

    it('CODECS 含逗号的引号值正确解析', () => {
      const v360 = variants.find((v) => v.resolution === '640x360');
      expect(v360?.codecs).toBe('avc1.42c01e,mp4a.40.2');
    });
  });

  describe('parseMediaPlaylist', () => {
    it('解析分片列表并解析绝对 URL', () => {
      const result = parseMediaPlaylist(MEDIA, 'https://cdn.example.com/video/720p/index.m3u8');
      expect(result.segments).toEqual([
        'https://cdn.example.com/video/720p/seg0.ts',
        'https://cdn.example.com/video/720p/seg1.ts',
        'https://cdn.example.com/video/720p/seg2.ts'
      ]);
      expect(result.encrypted).toBe(false);
    });

    it('累加总时长', () => {
      const result = parseMediaPlaylist(MEDIA, 'https://cdn.example.com/video/720p/index.m3u8');
      expect(result.totalDuration).toBeCloseTo(21.021, 2);
    });

    it('识别 AES-128 加密流', () => {
      const result = parseMediaPlaylist(MEDIA_ENCRYPTED, 'https://example.com/v/index.m3u8');
      expect(result.encrypted).toBe(true);
      expect(result.keyMethod).toBe('AES-128');
      expect(result.segments).toHaveLength(2);
    });

    it('METHOD=NONE 不算加密', () => {
      const content = '#EXTM3U\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:1.0,\nseg0.ts\n';
      const result = parseMediaPlaylist(content, 'https://example.com/v/index.m3u8');
      expect(result.encrypted).toBe(false);
    });

    it('绝对 URI 分片保持不变', () => {
      const content = '#EXTM3U\n#EXTINF:1.0,\nhttps://other.cdn.com/a.ts\n';
      const result = parseMediaPlaylist(content, 'https://example.com/v/index.m3u8');
      expect(result.segments[0]).toBe('https://other.cdn.com/a.ts');
    });
  });
});
