package llm

import (
	"context"
	_ "jd-matcher/internal/packed"
	"testing"

	"github.com/gogf/gf/v2/text/gstr"
)

func TestGetJobMatchPromptTemplate(t *testing.T) {
	type args struct {
		ctx context.Context
	}
	tests := []struct {
		name           string
		args           args
		wantErr        bool
	}{
		{
			name: "GetJobMatchPromptTemplate",
			args: args{
				ctx: context.Background(),
			},
			wantErr: false,
		},
	}
	InitOpenAIClient(context.Background())
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotPromptTemp, err := openAIClient.GetJobMatchPromptTemplate(tt.args.ctx)
			if (err != nil) != tt.wantErr {
				t.Errorf("GetJobMatchPromptTemplate() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if gotPromptTemp == "" {
				t.Errorf("GetJobMatchPromptTemplate() gotPromptTemp = %v", gotPromptTemp)
				return
			}
		})
	}
}

func TestGenerateResumeMatchPrompt(t *testing.T) {
	type args struct {
		ctx         context.Context
		promptTemp  string
		resume      string
		expectation string
		jobList     string
	}
	tests := []struct {
		name       string
		args       args
	}{
		{
			name: "GenerateResumeMatchPrompt",
			args: args{
				ctx:         context.Background(),
				promptTemp:  "{{ resume }} and {{ expectations }} and {{ job_list }}",
				resume:      "my resume",
				expectation: "job expectation",
				jobList:     "this is job list",
			},
		},
	}
	InitOpenAIClient(context.Background())
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotPrompt := openAIClient.GenerateResumeMatchPrompt(tt.args.ctx, tt.args.promptTemp, tt.args.resume, tt.args.expectation, tt.args.jobList)
			if gstr.Contains(gotPrompt, tt.args.resume) == false || gstr.Contains(gotPrompt, tt.args.expectation) == false || gstr.Contains(gotPrompt, tt.args.jobList) == false {
				t.Errorf("GenerateResumeMatchPrompt() = %v, replace placeholder failed", gotPrompt)
			}
		})
	}
}
