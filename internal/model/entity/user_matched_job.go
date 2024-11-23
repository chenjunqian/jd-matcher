// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

import (
	"github.com/gogf/gf/v2/os/gtime"
)

// UserMatchedJob is the golang structure for table user_matched_job.
type UserMatchedJob struct {
	UserId     string      `json:"userId"     orm:"user_id"     description:""` //
	JobId      string      `json:"jobId"      orm:"job_id"      description:""` //
	UpdateTime *gtime.Time `json:"updateTime" orm:"update_time" description:""` //
}
