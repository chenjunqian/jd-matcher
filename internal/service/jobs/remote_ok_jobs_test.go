package jobs

import (
	"context"
	"errors"
	"jd-matcher/internal/dao"
	"jd-matcher/internal/service/crawler"
	"testing"

	"go.uber.org/mock/gomock"
)

func Test_storeRemoteOkJobs(t *testing.T) {
	ctlr := gomock.NewController(t)
	mockJobDetailDao := dao.NewMockIJobDetail(ctlr)
	mockJobDetailDao.EXPECT().CreateJobDetailIfNotExist(gomock.Any(), gomock.Any()).Return(nil)

	mockErrorJobDetailDao := dao.NewMockIJobDetail(ctlr)
	mockErrorJobDetailDao.EXPECT().CreateJobDetailIfNotExist(gomock.Any(), gomock.Any()).Return(errors.New("error"))
	type args struct {
		ctx          context.Context
		jobs         []crawler.CommonJob
		jobDetailDao dao.IJobDetail
	}
	tests := []struct {
		name    string
		args    args
		wantErr bool
	}{
		{
			name: "storeRemoteOkJobs",
			args: args{
				ctx: context.Background(),
				jobs: []crawler.CommonJob{
					{
						Title: "test",
						Url:   "test",
						Tags:  []string{"test"},
						Location: "test",
						Salary:   "test",
						UpdateTime: "Mon, 02 Jan 2006 15:04:05 -0700",
					},
				},
				jobDetailDao: mockJobDetailDao,
			},
			wantErr: false,
		},
		{
			name: "storeRemoteOkJobs error",
			args: args{
				ctx: context.Background(),
				jobs: []crawler.CommonJob{
					{
						Title: "test",
						Url:   "test",
						Tags:  []string{"test"},
						Location: "test",
						Salary:   "test",
						UpdateTime: "Mon, 02 Jan 2006 15:04:05 -0700",
					},
				},
				jobDetailDao: mockErrorJobDetailDao,
			},
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := storeRemoteOkJobs(tt.args.ctx, tt.args.jobs, tt.args.jobDetailDao); (err != nil) != tt.wantErr {
				t.Errorf("storeRemoteOkJobs() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
