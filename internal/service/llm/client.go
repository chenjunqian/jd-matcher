package llm

import (
	"context"
	"errors"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/tmc/langchaingo/llms/openai"
)

type LLMClient struct {
	Client *openai.LLM
}

var openAIClient *LLMClient
var deepseekClient *LLMClient

type ILLMClient interface {
	EmbeddingText(ctx context.Context, contents []string) (vector [][]float32, err error)
	GenerateMatchJobByResumeResult(ctx context.Context, prompt string) (result string, err error)
	GetJobMatchPromptTemplate(ctx context.Context) (promptTemp string, err error)
	GenerateResumeMatchPrompt(ctx context.Context, promptTemp, resume, expectation, jobList string) (prompt string)
}

func InitOpenAIClient(ctx context.Context) error {
	g.Log().Line().Info(ctx, "init openai client")
	model := g.Cfg().MustGetWithEnv(ctx, "llm.openai.model").String()
	baseUrl := g.Cfg().MustGetWithEnv(ctx, "llm.openai.baseUrl").String()
	token := g.Cfg().MustGetWithEnv(ctx, "llm.openai.apiKey").String()
	embeddingModel := g.Cfg().MustGetWithEnv(ctx, "llm.openai.embeddingModel").String()

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
	openAIClient = new(LLMClient)
	openAIClient.Client, err = openai.New(opts...)
	if err != nil {
		g.Log().Fatal(ctx, err)
	}

	return err
}

func InitDeepSeekClient(ctx context.Context) error {
	g.Log().Line().Info(ctx, "init DeepSeek client")
	model := g.Cfg().MustGetWithEnv(ctx, "llm.deepseek.model").String()
	baseUrl := g.Cfg().MustGetWithEnv(ctx, "llm.deepseek.baseUrl").String()
	token := g.Cfg().MustGetWithEnv(ctx, "llm.deepseek.apiKey").String()

	if model == "" || baseUrl == "" || token == "" {
		g.Log().Line().Fatalf(ctx, "model:%s, baseUrl:%s, token:%s", model, baseUrl, token)
		return errors.New("model or baseUrl or token is empty for openai client")
	}

	opts := []openai.Option{
		openai.WithModel(model),
		openai.WithBaseURL(baseUrl),
		openai.WithToken(token),
	}

	var err error
	deepseekClient = new(LLMClient)
	deepseekClient.Client, err = openai.New(opts...)
	if err != nil {
		g.Log().Fatal(ctx, err)
	}

	return err
}

func GetDeepSeekClient() *LLMClient {
	return deepseekClient
}

func GetOpenAIClient() *LLMClient {
	return openAIClient
}
