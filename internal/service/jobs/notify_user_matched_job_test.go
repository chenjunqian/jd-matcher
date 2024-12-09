package jobs

import (
	"context"
	"errors"
	"jd-matcher/internal/dao"
	"testing"

	"go.uber.org/mock/gomock"
)

func Test_runNotifyUserMatchedJob_GetUserInfoCount_Error(t *testing.T) {

	mockCtrl := gomock.NewController(t)
	mockUserInfoDao := dao.NewMockIUserInfo(mockCtrl)
	mockUserInfoDao.EXPECT().GetAllUserInfoCount(gomock.Any()).Return(0, errors.New("error"))
	mockUserMatchedJobDao := dao.NewMockIUserMatchedJob(mockCtrl)

	err := runNotifyUserMatchedJob(context.Background(), mockUserInfoDao, mockUserMatchedJobDao)
	if err == nil {
		t.Errorf("runNotifyUserMatchedJob() error = %v, wantErr %v", err, true)
	} else if err.Error() != "error" {
		t.Errorf("runNotifyUserMatchedJob() error = %v, wantErr %v", err, "error")
	}

}

func Test_runNotifyUserMatchedJob_GetUserInfoCount_0_Success(t *testing.T) {
	
	mockCtrl := gomock.NewController(t)
	mockUserInfoDao := dao.NewMockIUserInfo(mockCtrl)
	mockUserInfoDao.EXPECT().GetAllUserInfoCount(gomock.Any()).Return(0, nil)
	mockUserMatchedJobDao := dao.NewMockIUserMatchedJob(mockCtrl)

	err := runNotifyUserMatchedJob(context.Background(), mockUserInfoDao, mockUserMatchedJobDao)
	if err != nil {
		t.Errorf("runNotifyUserMatchedJob() error = %v, wantErr %v", err, nil)
	}
}
