import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { normalizeTaxonomyValue } from './taxonomy-utils';

interface TagPickerProps {
  tags: string[];
  maxTags: number;
  onChange: (tags: string[]) => void;
}

export function TagPicker({ tags, maxTags, onChange }: TagPickerProps) {
  const [isInputVisible, setIsInputVisible] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isInputVisible) {
      inputRef.current?.focus();
    }
  }, [isInputVisible]);

  const addTag = (nextTag: string): boolean => {
    const value = normalizeTaxonomyValue(nextTag);
    if (!value || tags.includes(value) || tags.length >= maxTags) return false;

    onChange([...tags, value]);
    setQuery('');
    return true;
  };

  return (
    <div className="editor-tags" aria-label="文章标签">
      {tags.map((tag) => (
        <span key={tag} className="editor-tag">
          <span className="editor-tag-label">#{tag}</span>
          <button
            type="button"
            onClick={() => onChange(tags.filter((item) => item !== tag))}
            aria-label={`移除标签 ${tag}`}
          >
            <X size={12} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      ))}

      {tags.length < maxTags ? (
        <div className="editor-tag-picker">
          {isInputVisible ? (
            <input
              ref={inputRef}
              className="editor-tag-input"
              value={query}
              placeholder="标签"
              aria-label="新增标签"
              onBlur={() => setIsInputVisible(false)}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setIsInputVisible(false);
                  return;
                }

                if (event.key !== 'Enter') return;

                event.preventDefault();
                if (addTag(query)) {
                  setIsInputVisible(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="editor-add-tag"
              aria-expanded={isInputVisible}
              onClick={() => {
                setIsInputVisible(true);
                setQuery('');
              }}
            >
              <Plus size={12} strokeWidth={2} aria-hidden="true" />
              标签
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
