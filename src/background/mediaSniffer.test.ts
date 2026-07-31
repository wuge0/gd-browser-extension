import { describe, it, expect } from 'vitest';
import { buildSegmentTasks, sanitizeDirName } from './mediaSniffer';

describe('sanitizeDirName', () => {
  it('替换非法文件名字符', () => {
    expect(sanitizeDirName('a/b:c*d?e')).toBe('a_b_c_d_e');
  });

  it('空标题回退为 video', () => {
    expect(sanitizeDirName('')).toBe('video');
    expect(sanitizeDirName('   ')).toBe('video');
  });

  it('截断超长标题到 80 字符', () => {
    const long = 'x'.repeat(200);
    expect(sanitizeDirName(long).length).toBe(80);
  });
});

describe('buildSegmentTasks', () => {
  const segments = [
    'https://cdn.example.com/v/seg0.ts',
    'https://cdn.example.com/v/seg1.ts',
    'https://cdn.example.com/v/seg2.ts'
  ];

  it('out 按序号补零（至少 3 位）+ dir 归组', () => {
    const tasks = buildSegmentTasks(segments, 'My Video', []);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].options.out).toBe('000.ts');
    expect(tasks[2].options.out).toBe('002.ts');
    expect(tasks[0].options.dir).toBe('My Video');
  });

  it('保留分片扩展名', () => {
    const tasks = buildSegmentTasks(['https://x.com/a/frag1.m4s'], 'V', []);
    expect(tasks[0].options.out).toBe('000.m4s');
  });

  it('无扩展名回退 .ts', () => {
    const tasks = buildSegmentTasks(['https://x.com/a/segment'], 'V', []);
    expect(tasks[0].options.out).toBe('000.ts');
  });

  it('有请求头时写入 header 选项', () => {
    const headers = ['Referer: https://page.com'];
    const tasks = buildSegmentTasks(segments, 'V', headers);
    expect(tasks[0].options.header).toEqual(headers);
  });

  it('无请求头时不写 header 选项', () => {
    const tasks = buildSegmentTasks(segments, 'V', []);
    expect(tasks[0].options.header).toBeUndefined();
  });

  it('分片数超过 999 时序号位数自适应', () => {
    const many = Array.from({ length: 1000 }, (_, i) => `https://x.com/s${i}.ts`);
    const tasks = buildSegmentTasks(many, 'V', []);
    expect(tasks[0].options.out).toBe('0000.ts');
    expect(tasks[999].options.out).toBe('0999.ts');
  });
});
