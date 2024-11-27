package llm

import (
	"context"
	"errors"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/tmc/langchaingo/llms/openai"
)

var openAIClient *openai.LLM

func InitOpenAIClient(ctx context.Context) error {
	g.Log().Line().Info(ctx, "init openai client")
	model := g.Cfg().MustGetWithEnv(ctx, "openai.model").String()
	baseUrl := g.Cfg().MustGetWithEnv(ctx, "openai.baseUrl").String()
	token := g.Cfg().MustGetWithEnv(ctx, "openai.apiKey").String()
	embeddingModel := g.Cfg().MustGetWithEnv(ctx, "openai.embeddingModel").String()

	if model == "" || baseUrl == "" || token == "" {
		g.Log().Line().Fatalf(ctx, "model:%s, baseUrl:%s, token:%s", model, baseUrl, token)
		return errors.New("model or baseUrl or token is empty for openai client")
	}

	opts := []openai.Option{
		openai.WithModel(model),
		openai.WithBaseURL(baseUrl),
		openai.WithToken(token),
		openai.WithEmbeddingModel(embeddingModel),
	}

	var err error
	openAIClient, err = openai.New(opts...)
	if err != nil {
		g.Log().Fatal(ctx, err)
	}

	return err
}
