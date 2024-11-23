// =================================================================================
// This is auto-generated by GoFrame CLI tool only once. Fill this file as you wish.
// =================================================================================

package dao

import (
	"jd-matcher/internal/dao/internal"
)

// internalJobDetailDao is internal type for wrapping internal DAO implements.
type internalJobDetailDao = *internal.JobDetailDao

// jobDetailDao is the data access object for table job_detail.
// You can define custom methods on it to extend its functionality as you wish.
type jobDetailDao struct {
	internalJobDetailDao
}

var (
	// JobDetail is globally public accessible object for table job_detail operations.
	JobDetail = jobDetailDao{
		internal.NewJobDetailDao(),
	}
)

// Fill with you ideas below.
