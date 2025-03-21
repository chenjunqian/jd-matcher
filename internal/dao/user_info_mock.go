// Code generated by MockGen. DO NOT EDIT.
// Source: user_info.go
//
// Generated by this command:
//
//	mockgen -source=user_info.go -destination=user_info_mock.go
//

// Package mock_dao is a generated GoMock package.
package dao

import (
	context "context"
	entity "jd-matcher/internal/model/entity"
	reflect "reflect"

	gomock "go.uber.org/mock/gomock"
)

// MockIUserInfo is a mock of IUserInfo interface.
type MockIUserInfo struct {
	ctrl     *gomock.Controller
	recorder *MockIUserInfoMockRecorder
	isgomock struct{}
}

// MockIUserInfoMockRecorder is the mock recorder for MockIUserInfo.
type MockIUserInfoMockRecorder struct {
	mock *MockIUserInfo
}

// NewMockIUserInfo creates a new mock instance.
func NewMockIUserInfo(ctrl *gomock.Controller) *MockIUserInfo {
	mock := &MockIUserInfo{ctrl: ctrl}
	mock.recorder = &MockIUserInfoMockRecorder{mock}
	return mock
}

// EXPECT returns an object that allows the caller to indicate expected use.
func (m *MockIUserInfo) EXPECT() *MockIUserInfoMockRecorder {
	return m.recorder
}

// CreateUserInfoIfNotExist mocks base method.
func (m *MockIUserInfo) CreateUserInfoIfNotExist(ctx context.Context, userInfo entity.UserInfo) error {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "CreateUserInfoIfNotExist", ctx, userInfo)
	ret0, _ := ret[0].(error)
	return ret0
}

// CreateUserInfoIfNotExist indicates an expected call of CreateUserInfoIfNotExist.
func (mr *MockIUserInfoMockRecorder) CreateUserInfoIfNotExist(ctx, userInfo any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "CreateUserInfoIfNotExist", reflect.TypeOf((*MockIUserInfo)(nil).CreateUserInfoIfNotExist), ctx, userInfo)
}

// GetAllUserInfoCount mocks base method.
func (m *MockIUserInfo) GetAllUserInfoCount(ctx context.Context) (int, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "GetAllUserInfoCount", ctx)
	ret0, _ := ret[0].(int)
	ret1, _ := ret[1].(error)
	return ret0, ret1
}

// GetAllUserInfoCount indicates an expected call of GetAllUserInfoCount.
func (mr *MockIUserInfoMockRecorder) GetAllUserInfoCount(ctx any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "GetAllUserInfoCount", reflect.TypeOf((*MockIUserInfo)(nil).GetAllUserInfoCount), ctx)
}

// GetEmptyResumeUserInfoCount mocks base method.
func (m *MockIUserInfo) GetEmptyResumeUserInfoCount(ctx context.Context) (int, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "GetEmptyResumeUserInfoCount", ctx)
	ret0, _ := ret[0].(int)
	ret1, _ := ret[1].(error)
	return ret0, ret1
}

// GetEmptyResumeUserInfoCount indicates an expected call of GetEmptyResumeUserInfoCount.
func (mr *MockIUserInfoMockRecorder) GetEmptyResumeUserInfoCount(ctx any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "GetEmptyResumeUserInfoCount", reflect.TypeOf((*MockIUserInfo)(nil).GetEmptyResumeUserInfoCount), ctx)
}

// GetEmptyResumeUserInfoList mocks base method.
func (m *MockIUserInfo) GetEmptyResumeUserInfoList(ctx context.Context, offset, limit int) ([]entity.UserInfo, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "GetEmptyResumeUserInfoList", ctx, offset, limit)
	ret0, _ := ret[0].([]entity.UserInfo)
	ret1, _ := ret[1].(error)
	return ret0, ret1
}

// GetEmptyResumeUserInfoList indicates an expected call of GetEmptyResumeUserInfoList.
func (mr *MockIUserInfoMockRecorder) GetEmptyResumeUserInfoList(ctx, offset, limit any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "GetEmptyResumeUserInfoList", reflect.TypeOf((*MockIUserInfo)(nil).GetEmptyResumeUserInfoList), ctx, offset, limit)
}

// GetUserInfoByTelegramId mocks base method.
func (m *MockIUserInfo) GetUserInfoByTelegramId(ctx context.Context, telegramId string) (entity.UserInfo, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "GetUserInfoByTelegramId", ctx, telegramId)
	ret0, _ := ret[0].(entity.UserInfo)
	ret1, _ := ret[1].(error)
	return ret0, ret1
}

// GetUserInfoByTelegramId indicates an expected call of GetUserInfoByTelegramId.
func (mr *MockIUserInfoMockRecorder) GetUserInfoByTelegramId(ctx, telegramId any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "GetUserInfoByTelegramId", reflect.TypeOf((*MockIUserInfo)(nil).GetUserInfoByTelegramId), ctx, telegramId)
}

// GetUserInfoList mocks base method.
func (m *MockIUserInfo) GetUserInfoList(ctx context.Context, offset, limit int) ([]entity.UserInfo, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "GetUserInfoList", ctx, offset, limit)
	ret0, _ := ret[0].([]entity.UserInfo)
	ret1, _ := ret[1].(error)
	return ret0, ret1
}

// GetUserInfoList indicates an expected call of GetUserInfoList.
func (mr *MockIUserInfoMockRecorder) GetUserInfoList(ctx, offset, limit any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "GetUserInfoList", reflect.TypeOf((*MockIUserInfo)(nil).GetUserInfoList), ctx, offset, limit)
}

// IsUserHasUploadResume mocks base method.
func (m *MockIUserInfo) IsUserHasUploadResume(ctx context.Context, telegramId string) (bool, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "IsUserHasUploadResume", ctx, telegramId)
	ret0, _ := ret[0].(bool)
	ret1, _ := ret[1].(error)
	return ret0, ret1
}

// IsUserHasUploadResume indicates an expected call of IsUserHasUploadResume.
func (mr *MockIUserInfoMockRecorder) IsUserHasUploadResume(ctx, telegramId any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "IsUserHasUploadResume", reflect.TypeOf((*MockIUserInfo)(nil).IsUserHasUploadResume), ctx, telegramId)
}

// UpdateUserResume mocks base method.
func (m *MockIUserInfo) UpdateUserResume(ctx context.Context, telegramId, resume string, resumeEmbedding []float32) error {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "UpdateUserResume", ctx, telegramId, resume, resumeEmbedding)
	ret0, _ := ret[0].(error)
	return ret0
}

// UpdateUserResume indicates an expected call of UpdateUserResume.
func (mr *MockIUserInfoMockRecorder) UpdateUserResume(ctx, telegramId, resume, resumeEmbedding any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "UpdateUserResume", reflect.TypeOf((*MockIUserInfo)(nil).UpdateUserResume), ctx, telegramId, resume, resumeEmbedding)
}
