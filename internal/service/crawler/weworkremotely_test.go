package crawler

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/gogf/gf/v2/os/gfile"
	"github.com/gogf/gf/v2/os/gtime"
)

func Test_parseWeworkremotelyRSSResp(t *testing.T) {
	type args struct {
		ctx  context.Context
		resp string
	}
	tests := []struct {
		name    string
		args    args
		wantErr bool
	}{
		{
			name: "parseWeworkremotelyRSSResp",
			args: args{
				ctx:  context.Background(),
				resp: gfile.GetContents("testdata/weworkremotely_rss_resp.xml"),
			},
			wantErr: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotJobList, err := parseWeworkremotelyRSSResp(tt.args.ctx, tt.args.resp)
			if (err != nil) != tt.wantErr {
				t.Errorf("parseWeworkremotelyRSSResp() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if len(gotJobList) == 0 {
				t.Errorf("parseWeworkremotelyRSSResp() gotJobList = %v, is empty", gotJobList)
				return
			}

			format := "Mon, 02 Jan 2006 15:04:05 -0700"
			parsedTime, err := time.Parse(format, gotJobList[0].UpdateTime)
			updateTime := gtime.New(parsedTime)
			fmt.Printf("parseWeworkremotelyRSSResp() gotJobList[0].UpdateTime = %v\n", updateTime)
		})
	}
}
