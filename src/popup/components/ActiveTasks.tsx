import React from 'react';
import { Pause, Play, X } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import type { ActiveTask } from '@/shared/types';
import { formatFileSize } from '@/shared/utils/fileSize';
import { t } from '@/shared/utils/i18n';

/**
 * 格式化剩余时间（秒 -> mm:ss 或 hh:mm:ss）
 */
function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) {
    return '--:--';
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function TaskRow({ task }: { task: ActiveTask }) {
  const { pause, resume, cancel } = useTaskStore();

  const total = parseInt(task.totalLength, 10) || 0;
  const completed = parseInt(task.completedLength, 10) || 0;
  const speed = parseInt(task.downloadSpeed, 10) || 0;
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const eta = speed > 0 && total > completed ? (total - completed) / speed : Infinity;
  const isPaused = task.status === 'paused';

  return (
    <div style={{
      padding: 'var(--space-md)',
      borderBottom: '1px solid var(--border-lighter)',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <span style={{
          flex: 1,
          fontSize: '13px',
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }} title={task.filename}>
          {task.filename}
        </span>

        <button
          onClick={() => (isPaused ? resume(task.gid) : pause(task.gid))}
          title={isPaused ? t('taskResume') : t('taskPause')}
          style={iconBtnStyle}
        >
          {isPaused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <button
          onClick={() => cancel(task.gid)}
          title={t('taskCancel')}
          style={iconBtnStyle}
        >
          <X size={14} />
        </button>
      </div>

      {/* 进度条 */}
      <div style={{
        height: '4px',
        borderRadius: '2px',
        backgroundColor: 'var(--fill-base)',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${percent}%`,
          height: '100%',
          backgroundColor: isPaused ? 'var(--color-warning)' : 'var(--color-primary)',
          transition: 'width 0.3s'
        }} />
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '11px',
        color: 'var(--text-secondary)'
      }}>
        <span>
          {formatFileSize(completed)} / {total > 0 ? formatFileSize(total) : '?'} ({percent}%)
        </span>
        <span>
          {isPaused ? t('taskPaused') : `${formatFileSize(speed)}/s · ${formatEta(eta)}`}
        </span>
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: '24px',
  height: '24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: 'var(--radius-base)',
  cursor: 'pointer',
  color: 'var(--text-regular)'
};

function ActiveTasks() {
  const tasks = useTaskStore((s) => s.tasks);

  if (tasks.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-secondary)',
        fontSize: '13px'
      }}>
        {t('noActiveTasks')}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {tasks.map((task) => (
        <TaskRow key={task.gid} task={task} />
      ))}
    </div>
  );
}

export default ActiveTasks;
