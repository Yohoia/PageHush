import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { normalizeTaxonomyValue, type TopicOption } from './taxonomy-utils';

interface TopicPickerProps {
  topic: string;
  options: TopicOption[];
  onSelect: (topic: string) => void;
  onDelete: (topic: string) => void | Promise<void>;
}

export function TopicPicker({ topic, options, onSelect, onDelete }: TopicPickerProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [deletingTopic, setDeletingTopic] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const topicNames = useMemo(() => options.map((option) => option.name), [options]);
  const availableTopics = useMemo(() => {
    const normalized = query.trim();
    return normalized ? topicNames.filter((item) => item.includes(normalized)) : topicNames;
  }, [query, topicNames]);
  const exactTopic = normalizeTaxonomyValue(query);
  const canCreateTopic =
    exactTopic.length > 0 &&
    !topicNames.some((item) => item.toLowerCase() === exactTopic.toLowerCase());

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        !menuRef.current?.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isMenuOpen) return;
      setIsMenuOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen]);

  const selectTopic = (nextTopic: string) => {
    const value = normalizeTaxonomyValue(nextTopic);
    if (!value) return;

    onSelect(value);
    setIsMenuOpen(false);
    setQuery('');
  };

  const handleDelete = async (name: string) => {
    if (deletingTopic) return;
    setDeletingTopic(name);
    try {
      await onDelete(name);
    } finally {
      setDeletingTopic(null);
    }
  };

  return (
    <div className="editor-taxonomy">
      <div className="editor-topic-picker">
        <button
          ref={buttonRef}
          type="button"
          className="editor-topic-button"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {topic} · TOPIC
          <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
        </button>

        {isMenuOpen ? (
          <div ref={menuRef} className="editor-taxonomy-menu" role="menu">
            <label className="editor-taxonomy-field">
              <span>搜索或创建主题</span>
              <input
                value={query}
                placeholder="输入主题名称"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    selectTopic(availableTopics[0] ?? exactTopic);
                  }
                }}
              />
            </label>

            <div className="editor-taxonomy-options" role="group" aria-label="可选择主题">
              {availableTopics.map((item) => (
                <div
                  key={item}
                  className={`editor-taxonomy-option ${item === topic ? 'active' : ''}`}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="editor-taxonomy-option-label"
                    onClick={() => selectTopic(item)}
                  >
                    {item}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="editor-taxonomy-option-delete"
                    aria-label={`删除主题 ${item}`}
                    disabled={topicNames.length <= 1 || deletingTopic !== null}
                    aria-busy={deletingTopic === item}
                    onClick={() => handleDelete(item)}
                  >
                    <X size={12} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              ))}

              {canCreateTopic ? (
                <button
                  type="button"
                  role="menuitem"
                  className="create"
                  onClick={() => selectTopic(exactTopic)}
                >
                  创建「{exactTopic}」并使用
                </button>
              ) : null}

              {availableTopics.length === 0 && !canCreateTopic ? (
                <span className="editor-taxonomy-empty">没有找到主题</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
