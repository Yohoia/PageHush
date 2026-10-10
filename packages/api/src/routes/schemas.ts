// The single source of truth for HTTP contracts lives in @pagehush/shared so
// the web client derives its types from the same schemas the API validates with.
export {
  createTopicBodySchema,
  updateTopicBodySchema,
  createTagBodySchema,
  updateTagBodySchema,
  createArticleBodySchema,
  updateArticleBodySchema,
} from '@pagehush/shared';
