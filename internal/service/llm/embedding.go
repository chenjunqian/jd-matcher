package llm

import (
	"context"

	"github.com/gogf/gf/v2/frame/g"
)

func EmbeddingText(ctx context.Context, contents []string) (vector [][]float32, err error) {

	embeddings, err := openAIClient.CreateEmbedding(ctx, contents)
	if err != nil {
		g.Log().Error(ctx, err)
		return nil, err
	}

	return embeddings, nil
}