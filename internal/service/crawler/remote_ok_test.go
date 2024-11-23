package crawler

import (
	"context"
	"testing"

	"github.com/gogf/gf/v2/os/gfile"
)

func Test_parseRemoteOkMainPageJobs(t *testing.T) {
	type args struct {
		ctx     context.Context
		htmlStr string
	}
	tests := []struct {
		name     string
		args     args
	}{
		{
			name: "parseRemoteOkMainPageJobs",
			args: args{
				ctx:     context.Background(),
				htmlStr: gfile.GetContents("testdata/remote_ok_main_page_job.html"),
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotJobs := parseRemoteOkMainPageJobs(tt.args.ctx, tt.args.htmlStr)
			if len(gotJobs) == 0 {
				t.Errorf("parseRemoteOkMainPageJobs() get empty jobs")
				return
			}
			t.Logf("parseRemoteOkMainPageJobs() got jobs = %v", len(gotJobs))
		})
	}
}
