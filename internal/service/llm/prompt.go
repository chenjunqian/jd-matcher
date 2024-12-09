package llm

import (
	"context"

	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gfile"
	"github.com/gogf/gf/v2/os/gres"
	"github.com/gogf/gf/v2/text/gstr"
	"github.com/gogf/gf/v2/util/gconv"
)

func (c *LLMClient) GetJobMatchPromptTemplate(ctx context.Context) (promptTemp string, err error) {

	promptTempContent := gres.GetContent("resource/prompt/resume_match.md")

	if promptTempContent == nil || len(promptTempContent) == 0 {
		promptTempContent = []byte(gfile.GetContents("resource/prompt/resume_match.md"))
	}

	if promptTempContent == nil || len(promptTempContent) == 0 {
		err = gerror.New("resource/prompt/resume_match.md not found")
		g.Log().Line().Error(ctx, "resource/prompt/resume_match.md not found")
		return
	}

	promptTemp = gconv.String(promptTempContent)

	return
}

func (c *LLMClient) GenerateResumeMatchPrompt(ctx context.Context, promptTemp, resume, expectation, jobList string) (prompt string) {

	promptTemp = gstr.Replace(promptTemp, "{{ resume }}", resume)
	promptTemp = gstr.Replace(promptTemp, "{{ expectations }}", expectation)
	promptTemp = gstr.Replace(promptTemp, "{{ job_list }}", jobList)

	prompt = promptTemp

	return
}
