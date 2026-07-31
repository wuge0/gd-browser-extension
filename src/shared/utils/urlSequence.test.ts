import { describe, it, expect } from 'vitest';
import { expandSequence, hasSequence } from './urlSequence';
import { pickLargestFromSrcset } from './srcset';

describe('expandSequence', () => {
  it('零填充范围展开', () => {
    expect(expandSequence('file[01-03].zip')).toEqual([
      'file01.zip',
      'file02.zip',
      'file03.zip'
    ]);
  });

  it('无前导零不补零', () => {
    expect(expandSequence('img[1-3].jpg')).toEqual(['img1.jpg', 'img2.jpg', 'img3.jpg']);
  });

  it('跨位数零填充按最大宽度', () => {
    expect(expandSequence('p[08-10].png')).toEqual(['p08.png', 'p09.png', 'p10.png']);
  });

  it('start > end 自动升序', () => {
    expect(expandSequence('a[3-1].txt')).toEqual(['a1.txt', 'a2.txt', 'a3.txt']);
  });

  it('无占位原样返回', () => {
    expect(expandSequence('single.zip')).toEqual(['single.zip']);
  });

  it('超过上限不展开', () => {
    expect(expandSequence('x[1-5000].bin')).toEqual(['x[1-5000].bin']);
  });

  it('仅替换第一个占位', () => {
    expect(expandSequence('a[1-2]/b[01-99].jpg')).toEqual([
      'a1/b[01-99].jpg',
      'a2/b[01-99].jpg'
    ]);
  });

  it('hasSequence 检测占位', () => {
    expect(hasSequence('a[1-3].zip')).toBe(true);
    expect(hasSequence('a.zip')).toBe(false);
  });
});

describe('pickLargestFromSrcset', () => {
  it('按 w 描述符取最大', () => {
    expect(pickLargestFromSrcset('a.jpg 320w, b.jpg 640w, c.jpg 1280w', 'x.jpg')).toBe('c.jpg');
  });

  it('按 x 描述符取最大', () => {
    expect(pickLargestFromSrcset('a.jpg, b.jpg 2x, c.jpg 3x', 'x.jpg')).toBe('c.jpg');
  });

  it('空 srcset 返回 fallback', () => {
    expect(pickLargestFromSrcset('', 'fallback.jpg')).toBe('fallback.jpg');
  });

  it('无描述符默认 1x', () => {
    expect(pickLargestFromSrcset('only.jpg', 'fallback.jpg')).toBe('only.jpg');
  });

  it('容忍多余空白', () => {
    expect(pickLargestFromSrcset('  a.jpg   100w ,  b.jpg  200w ', 'x.jpg')).toBe('b.jpg');
  });
});
